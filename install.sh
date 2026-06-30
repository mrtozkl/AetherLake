#!/bin/bash
set -e

# AetherLake Automated Installation Script

echo "🌊 Starting AetherLake installation..."

# 1. Check prerequisites
if ! command -v kubectl &> /dev/null; then
    echo "❌ Error: kubectl is not installed."
    exit 1
fi

if ! command -v helm &> /dev/null; then
    echo "❌ Error: helm is not installed."
    exit 1
fi

# 2. Create Namespace
echo "📦 Creating aetherlake namespace..."
kubectl create namespace aetherlake --dry-run=client -o yaml | kubectl apply -f -

# 3. Create Secrets
echo "🔐 Configuring credentials..."

# Generate a URL-safe random secret value.
gen_secret() {
    LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32
}

# Generate the credential values ONCE. The security-stack (Keycloak) and the
# core-data-stack read these same OIDC keys from two differently-named secrets,
# so the values must be identical across both — otherwise SSO breaks. Values are
# randomized per install so the repository never ships real passwords.
MINIO_ROOT_USER="${MINIO_ROOT_USER:-admin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-$(gen_secret)}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-$(gen_secret)}"
TRINO_OIDC_SECRET="$(gen_secret)"
AIRFLOW_OIDC_SECRET="$(gen_secret)"
POLARIS_OIDC_SECRET="$(gen_secret)"
MILVUS_OIDC_SECRET="$(gen_secret)"
CONTROL_PANEL_OIDC_SECRET="$(gen_secret)"
SUPERSET_OIDC_SECRET="$(gen_secret)"
MINIO_OIDC_SECRET="$(gen_secret)"
LDAP_BIND_PASSWORD="$(gen_secret)"
# Shared maintained datastores (official postgres/redis images) used by Superset
# and Airflow instead of the retired Bitnami images.
POSTGRES_PASSWORD="$(gen_secret)"
REDIS_PASSWORD="$(gen_secret)"
# Keycloak's database lives in its OWN postgres instance (security-stack) with a
# distinct password, so a leak of the shared data-stack password never exposes
# the identity datastore. See docs/guide/components/postgres.md.
KEYCLOAK_DB_PASSWORD="$(gen_secret)"
# Apache Polaris root (bootstrap) client credential. The deployment and init job
# read id/secret separately; Trino reads the combined "id:secret" form.
POLARIS_CLIENT_ID="${POLARIS_CLIENT_ID:-open-lake-admin}"
POLARIS_CLIENT_SECRET="$(gen_secret)"
POLARIS_CREDENTIAL="${POLARIS_CLIENT_ID}:${POLARIS_CLIENT_SECRET}"
# Dedicated MinIO user Polaris uses to vend sub-scoped S3 credentials (STS
# AssumeRole). The MinIO root account cannot AssumeRole, so a regular user with a
# bucket-scoped policy is required. minio-init creates it; Polaris authenticates
# to STS with it.
MINIO_POLARIS_ACCESS_KEY="${MINIO_POLARIS_ACCESS_KEY:-polaris}"
MINIO_POLARIS_SECRET_KEY="$(gen_secret)"

# Create a credentials secret from the shared values above. Pass the name as $1.
create_credentials_secret() {
    local secret_name="$1"
    if kubectl get secret "$secret_name" -n aetherlake &> /dev/null; then
        echo "   $secret_name secret already exists. Skipping."
        return
    fi
    echo "   Creating $secret_name..."
    kubectl create secret generic "$secret_name" -n aetherlake \
        --from-literal=minio-root-user="$MINIO_ROOT_USER" \
        --from-literal=minio-root-password="$MINIO_ROOT_PASSWORD" \
        --from-literal=trino-oidc-secret="$TRINO_OIDC_SECRET" \
        --from-literal=airflow-oidc-secret="$AIRFLOW_OIDC_SECRET" \
        --from-literal=polaris-oidc-secret="$POLARIS_OIDC_SECRET" \
        --from-literal=milvus-oidc-secret="$MILVUS_OIDC_SECRET" \
        --from-literal=control-panel-oidc-secret="$CONTROL_PANEL_OIDC_SECRET" \
        --from-literal=superset-oidc-secret="$SUPERSET_OIDC_SECRET" \
        --from-literal=minio-oidc-secret="$MINIO_OIDC_SECRET" \
        --from-literal=minio-polaris-access-key="$MINIO_POLARIS_ACCESS_KEY" \
        --from-literal=minio-polaris-secret-key="$MINIO_POLARIS_SECRET_KEY" \
        --from-literal=keycloak-admin-password="$KEYCLOAK_ADMIN_PASSWORD" \
        --from-literal=ldap-bind-password="$LDAP_BIND_PASSWORD" \
        --from-literal=polaris-client-id="$POLARIS_CLIENT_ID" \
        --from-literal=polaris-client-secret="$POLARIS_CLIENT_SECRET" \
        --from-literal=polaris-credential="$POLARIS_CREDENTIAL" \
        --from-literal=postgres-password="$POSTGRES_PASSWORD" \
        --from-literal=keycloak-db-password="$KEYCLOAK_DB_PASSWORD" \
        --from-literal=redis-password="$REDIS_PASSWORD"
}

# Primary secret plus the aetherlake-credentials alias referenced by the charts.
create_credentials_secret open-lake-credentials
create_credentials_secret aetherlake-credentials

# Airflow secret for the official Apache Airflow chart. One secret holds the
# three keys the chart references: the metadata DB connection string (pointing at
# the shared maintained postgres), the Fernet key (32-byte url-safe base64) and
# the Flask webserver secret key.
if ! kubectl get secret airflow-official -n aetherlake &> /dev/null; then
    echo "   Creating airflow-official..."
    kubectl create secret generic airflow-official -n aetherlake \
        --from-literal=connection="postgresql://airflow:${POSTGRES_PASSWORD}@aetherlake-postgres:5432/airflow" \
        --from-literal=fernet-key="$(openssl rand -base64 32 | tr '+/' '-_' | head -c 44)" \
        --from-literal=webserver-secret-key="$(gen_secret)"
else
    echo "   airflow-official secret already exists. Skipping."
fi

echo "   ℹ️  Credentials were randomly generated. Retrieve them with:"
echo "      kubectl get secret aetherlake-credentials -n aetherlake -o jsonpath='{.data.keycloak-admin-password}' | base64 -d"

# 4. Deploy Security Stack
echo "🛡️ Deploying Security Stack (Keycloak)..."
cd helm-charts/security-stack
helm dependency update
helm upgrade --install security-stack . -n aetherlake
cd ../..

# Wait for Keycloak to be ready before deploying the core data stack
echo "⏳ Waiting for Keycloak to be ready (this may take a few minutes)..."
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=keycloak -n aetherlake --timeout=300s || true

# 4b. Make keycloak.aetherlake.local resolvable INSIDE the cluster. That hostname
# is the OIDC issuer/frontend URL, but it is an ingress host only meant for the
# browser — it does not resolve via cluster DNS. Server-side OIDC discovery from
# MinIO/Superset/Airflow/Polaris therefore times out, and MinIO in particular
# blocks its entire IAM subsystem ("Waiting for OpenID to be initialized").
# Add a CoreDNS rewrite so in-cluster lookups hit the Keycloak Service directly
# (the realm frontendUrl keeps the issuer consistent for browsers).
echo "🌐 Adding CoreDNS rewrite for in-cluster keycloak.aetherlake.local..."
KEYCLOAK_FQDN="security-stack-keycloak.aetherlake.svc.cluster.local"
REWRITE_RULE="rewrite name keycloak.aetherlake.local ${KEYCLOAK_FQDN}"
COREFILE="$(kubectl get configmap coredns -n kube-system -o jsonpath='{.data.Corefile}')"
if ! printf '%s' "$COREFILE" | grep -q "keycloak.aetherlake.local"; then
    # Remove any stale open-lake hosts block and inject the rewrite after ".:53 {".
    printf '%s' "$COREFILE" \
        | sed '/10\.[0-9.]* keycloak\.open-lake\.local/d' \
        | sed "s|^\\.:53 {|.:53 {\n    ${REWRITE_RULE}|" > /tmp/aetherlake-corefile
    kubectl create configmap coredns -n kube-system --from-file=Corefile=/tmp/aetherlake-corefile \
        --dry-run=client -o yaml | kubectl apply -f -
    kubectl rollout restart deployment/coredns -n kube-system
    kubectl rollout status deployment/coredns -n kube-system --timeout=60s || true
else
    echo "   CoreDNS rewrite already present. Skipping."
fi

# 5a. Ensure the MinIO Operator is present. Object storage is provisioned through
# a MinIO `Tenant` CRD (helm-charts/core-data-stack/templates/minio-tenant.yaml);
# without the operator running, that Tenant is never reconciled and the whole
# lakehouse has no storage. Install it if the CRD is missing.
if ! kubectl get crd tenants.minio.min.io &> /dev/null; then
    echo "🪣 MinIO Operator not found. Installing it..."
    helm repo add minio-operator https://operator.min.io 2>/dev/null || true
    helm repo update minio-operator
    helm upgrade --install minio-operator minio-operator/operator \
        --namespace minio-operator --create-namespace
    echo "⏳ Waiting for MinIO Operator to be ready..."
    kubectl wait --for=condition=available deployment -l app.kubernetes.io/name=operator \
        -n minio-operator --timeout=300s || true
else
    echo "🪣 MinIO Operator already present. Skipping."
fi

# 5b. Deploy Core Data Stack
echo "📊 Deploying Core Data Stack..."
cd helm-charts/core-data-stack
helm dependency update
# Pass the MinIO root credentials and OIDC client secret so the values baked into
# the tenant config match the cluster secret that Trino/Milvus/Polaris read and
# the secret provisioned for the `minio` Keycloak client.
helm upgrade --install core-data-stack . -n aetherlake \
    --set minio.rootUser="$MINIO_ROOT_USER" \
    --set minio.rootPassword="$MINIO_ROOT_PASSWORD" \
    --set minio.oidc.clientSecret="$MINIO_OIDC_SECRET"
cd ../..

# 6. Apply Ingress
echo "🌐 Applying Ingress rules..."
kubectl apply -f aetherlake-ingress.yaml

echo ""
echo "✅ AetherLake has been successfully deployed to Kubernetes!"
echo ""
echo "🚀 Next Steps:"
echo "1. Ensure you have added the required DNS entries to your /etc/hosts file as described in the README."
echo "2. Check pod status with: kubectl get pods -n aetherlake"
echo "3. To start the Control Panel locally, run:"
echo "   cd control-panel && npm install && npm run dev"
echo ""

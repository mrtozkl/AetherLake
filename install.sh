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
LDAP_BIND_PASSWORD="$(gen_secret)"

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
        --from-literal=keycloak-admin-password="$KEYCLOAK_ADMIN_PASSWORD" \
        --from-literal=ldap-bind-password="$LDAP_BIND_PASSWORD"
}

# Primary secret plus the aetherlake-credentials alias referenced by the charts.
create_credentials_secret open-lake-credentials
create_credentials_secret aetherlake-credentials

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

# 5. Deploy Core Data Stack
echo "📊 Deploying Core Data Stack..."
cd helm-charts/core-data-stack
helm dependency update
helm upgrade --install core-data-stack . -n aetherlake
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

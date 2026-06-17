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

# Check if open-lake-credentials exists
if ! kubectl get secret open-lake-credentials -n aetherlake &> /dev/null; then
    echo "   Creating open-lake-credentials..."
    kubectl create secret generic open-lake-credentials -n aetherlake \
        --from-literal=minio-root-user=admin \
        --from-literal=minio-root-password=password \
        --from-literal=trino-oidc-secret=trino-secret-key \
        --from-literal=airflow-oidc-secret=airflow-secret-key \
        --from-literal=polaris-oidc-secret=polaris-secret-key \
        --from-literal=milvus-oidc-secret=milvus-secret-key \
        --from-literal=control-panel-oidc-secret=control-panel-secret-key \
        --from-literal=superset-oidc-secret=superset-secret-key \
        --from-literal=keycloak-admin-password=super-secure-admin-password \
        --from-literal=ldap-bind-password=ldap-service-password
else
    echo "   open-lake-credentials secret already exists. Skipping."
fi

# Create aetherlake-credentials alias
if ! kubectl get secret aetherlake-credentials -n aetherlake &> /dev/null; then
    echo "   Creating aetherlake-credentials (alias)..."
    kubectl create secret generic aetherlake-credentials -n aetherlake \
        --from-literal=minio-root-user=admin \
        --from-literal=minio-root-password=password \
        --from-literal=trino-oidc-secret=trino-secret-key \
        --from-literal=airflow-oidc-secret=airflow-secret-key \
        --from-literal=polaris-oidc-secret=polaris-secret-key \
        --from-literal=milvus-oidc-secret=milvus-secret-key \
        --from-literal=control-panel-oidc-secret=control-panel-secret-key \
        --from-literal=superset-oidc-secret=superset-secret-key \
        --from-literal=keycloak-admin-password=super-secure-admin-password \
        --from-literal=ldap-bind-password=ldap-service-password
else
    echo "   aetherlake-credentials secret already exists. Skipping."
fi

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

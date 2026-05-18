# Configuration Guide

AetherLake is primarily configured via Helm values.

## Component Toggles

Each component can be individually enabled or disabled in your `values.yaml` file:

```yaml
minio:
  enabled: true

trino:
  enabled: true
  server:
    workers: 2      # Scale Trino workers

polaris:
  enabled: true

spark-operator:
  enabled: true

airflow:
  enabled: false    # Disable if not needed

milvus:
  enabled: true

keycloak:
  enabled: true
```

## Security & Secrets Management

All credentials are managed through a single Kubernetes Secret (`aetherlake-credentials`), referenced by all components:

```yaml
global:
  existingSecret: "aetherlake-credentials"
```

The Control Panel can dynamically provision and rotate secrets via the Kubernetes API.

::: warning IMPORTANT
**DO NOT USE DEFAULT SECRETS IN PRODUCTION.** 
Before exposing your AetherLake cluster to a public or production environment, you **MUST**:
1. Change all default passwords in your `secrets.yaml` and `values.yaml` files.
2. Ensure `NEXTAUTH_SECRET` is set securely.
3. Use proper TLS certificates on the Ingress Controller.
:::

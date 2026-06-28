# Configuration Guide

AetherLake is primarily configured via Helm values across the two charts
(`security-stack`, `core-data-stack`).

> For the **full setting reference of each component** — every value, default and
> gotcha — see the per-component pages under **Component Reference** in the
> sidebar. This page covers the cross-cutting configuration.

## Component Toggles

Each `core-data-stack` component can be enabled or disabled in `values.yaml`:

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
  enabled: true

superset:
  enabled: true

milvus:
  enabled: true
```

Keycloak is toggled in the `security-stack` chart (`keycloak.enabled`).

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

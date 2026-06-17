# ☸️ Kubernetes & Helm Development Standards

This document outlines the conventions for developing, configuring, and deploying Helm charts in AetherLake.

---

## 📁 Helm Chart Layout

AetherLake uses a multi-stack Helm architecture:
1. **`security-stack`**: Standardizes Keycloak OIDC authentication, RBAC settings, and realm clients.
2. **`core-data-stack`**: deploys MinIO, Trino, Apache Polaris, Apache Spark, and Milvus.

---

## 🛠️ YAML & Templating Rules

- **Indentation**: Use 2 spaces for all YAML indentation. Do **NOT** use tab characters.
- **Component Toggles**: Every micro-service inside `core-data-stack` or `security-stack` must be configurable via toggles in `values.yaml` (e.g., `enabled: true|false`). Wrap template deployments in matching conditional gates:
  ```yaml
  {{- if .Values.componentName.enabled }}
  ...
  {{- end }}
  ```
- **Secrets Isolation**:
  > [!IMPORTANT]
  > Do not put hardcoded passwords in templates. Use the global secret variable:
  > ```yaml
  > global:
  >   existingSecret: "aetherlake-credentials"
  > ```
  > Use `envFrom` or `valueFrom.secretKeyRef` to load secret credentials dynamically into pods.

---

## 🚀 Lifecycle & Testing Workflows

1. **Dependency Syncing**: If dependencies in `Chart.yaml` are modified, you must update local charts:
   ```bash
   helm dependency update
   ```
2. **Linting Verification**: Always lint charts when changing template YAML or helper definitions:
   ```bash
   helm lint .
   ```
3. **Template Compilation Dry-Run**: Confirm compile correctness before pushing:
   ```bash
   helm template stack-name . --debug
   ```

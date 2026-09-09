# ☸️ Kubernetes & Helm Development Standards

This document outlines the conventions for developing, configuring, and deploying Helm charts in AetherLake.

---

## 📁 Helm Chart Layout

AetherLake uses a multi-stack Helm architecture:
1. **`security-stack`**: Standardizes Keycloak 26 OIDC authentication, RBAC settings, realm provisioning (`files/aetherlake-realm.json`), and client secrets.
2. **`core-data-stack`**: Deploys the full data lakehouse infrastructure:
   - **Storage**: MinIO Tenant (S3-compatible) with automated bucket initialization (`initBuckets`).
   - **Catalog**: Apache Polaris (Iceberg REST catalog) with PostgreSQL metastore.
   - **Query Engine**: Trino 480 with Iceberg, Kafka, and PostgreSQL connectors, HTTPS/TLS, and internal password authentication.
   - **Streaming**: Apache Kafka 4.3 (Strimzi Operator, KRaft mode) and Apache Flink 2.1 (Flink Kubernetes Operator).
   - **Analytics & BI**: Apache Superset 3.1 and Apache Airflow 2.10.
   - **Vector Search**: Milvus with Attu UI.
   - **Observability**: Prometheus TSDB and pre-provisioned Grafana dashboards (`templates/monitoring.yaml`).
   - **Edge Gateways**: oauth2-proxy SSO gate, NGINX Ingress, and cert-manager TLS certificates.
   - **Telemetry**: Anonymous platform health CronJob (`telemetry-cronjob.yaml`).

---

## ☁️ Multi-Cloud Values Profiles

In addition to the default local `values.yaml`, cloud-specific overrides are maintained:
- **`values-aws.yaml`**: Amazon EKS, Amazon S3 (`s3a://`), AWS IAM IRSA annotations, and Amazon RDS PostgreSQL.
- **`values-azure.yaml`**: Azure AKS, Azure ADLS Gen2 (`abfss://`), Azure Workload Identity, and Azure Database for PostgreSQL.
- **`values-gcp.yaml`**: Google Kubernetes Engine (GKE), Google Cloud Storage (`gs://`), GKE Workload Identity annotations, and Cloud SQL for PostgreSQL.

---

## 🛠️ YAML & Templating Rules

- **Indentation**: Use 2 spaces for all YAML indentation. Do **NOT** use tab characters.
- **Component Toggles**: Every service inside `core-data-stack` must be toggleable via `values.yaml` (e.g. `kafka.enabled`, `flink.enabled`, `trino.enabled`, `telemetry.enabled`). Wrap template deployments in matching conditional gates:
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
  > Use `valueFrom.secretKeyRef` to load secret credentials dynamically into pods.

---

## 🚀 Lifecycle & Testing Workflows

1. **Dependency Syncing**: If dependencies in `Chart.yaml` are modified, update local chart dependencies:
   ```bash
   helm dependency update helm-charts/core-data-stack
   ```
2. **Linting Verification**: Always lint charts when changing template YAML or helper definitions:
   ```bash
   helm lint helm-charts/core-data-stack
   helm lint helm-charts/security-stack
   ```
3. **Template Compilation Dry-Run**: Confirm compile correctness before pushing:
   ```bash
   helm template core-data-stack helm-charts/core-data-stack > /dev/null
   helm template security-stack helm-charts/security-stack > /dev/null
   ```

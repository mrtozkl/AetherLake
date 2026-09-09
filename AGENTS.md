# 🤖 AetherLake - AI Agent Instructions (AGENTS.md)

Welcome! This document provides foundational guidelines, development standards, architectural navigation, and verification workflows for AI coding assistants (Cursor, Windsurf, Copilot, Cline, Claude Code, etc.) operating in the AetherLake repository.

---

## 🏛️ Project Architecture & Component Overview

AetherLake is an enterprise-grade, Kubernetes-native open-source Data Lakehouse platform combining best-in-class open-source systems:

- **Storage Layer**: MinIO S3-compatible tenant (local/dev) or native Cloud Object Storage (AWS S3, Azure ADLS Gen2, GCP GCS).
- **Catalog & Governance**: Apache Polaris (incubating) Iceberg REST catalog backed by PostgreSQL with S3 credential vending.
- **Query Engine**: Trino (v480) with Iceberg REST, Kafka, and PostgreSQL catalogs; HTTPS/TLS enabled with internal password authentication.
- **Streaming & Ingestion**:
  - Apache Kafka (Strimzi Operator 1.1.0, KRaft mode) with TLS/SCRAM external access.
  - Apache Flink (Flink Kubernetes Operator 1.10) with custom Application-mode SQL runner (`pipelines/flink/sql-runner`).
  - Kafka-to-Iceberg streaming bridge ETL (`pipelines/flink/examples/kafka-to-iceberg.sql`).
- **Data Transformations**: dbt 1.8 (`dbt-trino`) implementing the Medallion Architecture (Bronze → Silver → Gold) in `pipelines/dbt/`.
- **Vector Database**: Milvus with Attu web UI for AI/RAG workloads.
- **Identity & Security**: Keycloak 26 (realm `aetherlake`, OIDC clients, oauth2-proxy gate for non-OIDC UIs, random per-install credentials in `aetherlake-credentials`).
- **Observability**: Prometheus TSDB (v2.51) + pre-provisioned Grafana dashboards (v10.4) for Trino, Kafka, Flink, MinIO, and Pod metrics (`http://grafana.aetherlake.local`, `http://prometheus.aetherlake.local`).
- **Control Panel**: Next.js 16 (React 19, TypeScript, Tailwind CSS, Monaco SQL Editor, React Flow + Dagre Lineage DAG, bilingual EN/TR).
- **AI Assist (MCP Server)**: Stdio Model Context Protocol server (`mcp-server/`) providing tools for platform health, service logs, Trino queries, Polaris catalogs, and Airflow DAGs.
- **Multi-Cloud & IaC**: Terraform modules for AWS (`terraform/aws/`), Azure (`terraform/azure/`), and GCP (`terraform/gcp/`); Helm override profiles (`values-aws.yaml`, `values-azure.yaml`, `values-gcp.yaml`).
- **Anonymous Telemetry**: Edge telemetry collector (`telemetry-collector/`, `telemetry-worker/`) with opt-out flags.

---

## 🧭 General Principles for Agents

1. **Incremental & Targeted Updates**: Never rewrite entire files when making focused bug fixes or feature additions. Use line-range and targeted replacements.
2. **Strict Type Safety**: TypeScript is mandatory across `control-panel` and `mcp-server`. Never use the `any` type. Define explicit interfaces for all API contracts, payloads, and component props.
3. **Bilingual Requirement (i18n)**: Every user-visible string in the Control Panel must be registered in both English (`en`) and Turkish (`tr`) dictionaries inside [control-panel/src/app/i18n.ts](file:///Users/mrtozkl/Documents/open-lake/control-panel/src/app/i18n.ts).
4. **Secrets & Security Isolation**:
   > [!CAUTION]
   > Never commit or hardcode plain text secrets, passwords, or tokens. In Kubernetes, reference the `aetherlake-credentials` secret. In Next.js, read from environment variables with fallback protections.
5. **Double Verification**: Always execute build and test suites before declaring task completion.

---

## 🛠️ Verification & Development Workflows

Run the corresponding validation command before submitting or concluding any task:

### 1. Control Panel (Frontend)
```bash
cd control-panel
npm test         # Unit tests (i18n, auth, telemetry)
npm run lint     # Next.js ESLint
npm run build    # Production bundle compilation
```

### 2. MCP Server (Backend)
```bash
cd mcp-server
npm test         # MCP tool schema & auth tests
npm run build    # TypeScript to ESM compilation (dist/index.js)
```

### 3. Helm Charts (Kubernetes)
```bash
cd helm-charts/core-data-stack && helm lint .
cd helm-charts/security-stack && helm lint .
# Validate template rendering (Dry-run):
helm template core-data-stack helm-charts/core-data-stack > /dev/null
helm template security-stack helm-charts/security-stack > /dev/null
```

### 4. Data Pipelines (Spark, dbt, Airflow)
```bash
python3 -m unittest discover -s pipelines/tests -p "test_*.py" -v
```

### 5. Documentation (VitePress)
```bash
cd docs
npm run docs:build
```

---

## 🔍 Directory & Context Reference

- **Control Panel**: [control-panel/src/app/](file:///Users/mrtozkl/Documents/open-lake/control-panel/src/app)
- **MCP Server Logic**: [mcp-server/src/index.ts](file:///Users/mrtozkl/Documents/open-lake/mcp-server/src/index.ts)
- **Helm Values & Templates**: [helm-charts/core-data-stack/values.yaml](file:///Users/mrtozkl/Documents/open-lake/helm-charts/core-data-stack/values.yaml)
- **dbt Models**: [pipelines/dbt/models/](file:///Users/mrtozkl/Documents/open-lake/pipelines/dbt/models)
- **Flink SQL Jobs**: [pipelines/flink/examples/](file:///Users/mrtozkl/Documents/open-lake/pipelines/flink/examples)
- **Terraform Stacks**: [terraform/aws/](file:///Users/mrtozkl/Documents/open-lake/terraform/aws), [terraform/azure/](file:///Users/mrtozkl/Documents/open-lake/terraform/azure), [terraform/gcp/](file:///Users/mrtozkl/Documents/open-lake/terraform/gcp)
- **Agent Rules Directory**:
  - [Control Panel Guidelines](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/control-panel.md)
  - [MCP Server SDK Standards](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/mcp-server.md)
  - [Helm Chart Development](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/helm-charts.md)
  - [Data Pipelines & DAGs](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/pipelines.md)

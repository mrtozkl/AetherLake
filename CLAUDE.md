# 🤖 Claude Code Guidelines - AetherLake

This document provides guidelines and commands for Claude Code agents working in the AetherLake repository.

---

## 🏛️ Project Overview
AetherLake is a Kubernetes-native open-source Data Lakehouse platform.
- **Control Panel**: Next.js 16 Web UI (TypeScript, Tailwind, i18n EN/TR, NextAuth/Keycloak). In `control-panel/`.
- **MCP Server**: Model Context Protocol stdio server (Node.js, TypeScript). In `mcp-server/`.
- **Helm Charts**: `core-data-stack` (MinIO, Trino, Polaris, Kafka, Flink, Superset, Airflow, Milvus) & `security-stack` (Keycloak OIDC). In `helm-charts/`.
- **Pipelines**: Spark, Airflow, Flink SQL streaming, and dbt Medallion modeling. In `pipelines/`.
- **Cloud IaC**: AWS (`terraform/aws/`), Azure (`terraform/azure/`), and GCP (`terraform/gcp/`).
- **Monitoring**: Prometheus TSDB + Grafana dashboards (`grafana.aetherlake.local`).

---

## 🛠️ Verification & Test Commands

Before completing any task, execute the relevant verification commands:

```bash
# 1. Frontend (Control Panel)
cd control-panel && npm test && npm run lint && npm run build

# 2. Backend (MCP Server)
cd mcp-server && npm test && npm run build

# 3. Kubernetes / Helm Charts
helm lint helm-charts/core-data-stack
helm lint helm-charts/security-stack
helm template core-data-stack helm-charts/core-data-stack > /dev/null
helm template security-stack helm-charts/security-stack > /dev/null

# 4. Data Pipelines (Python unittests)
python3 -m unittest discover -s pipelines/tests -p "test_*.py" -v

# 5. Documentation (VitePress)
cd docs && npm run docs:build
```

---

## 📝 Critical Coding Rules

1. **TypeScript Strictness**: No `any` type. Define explicit interfaces.
2. **Internationalization (i18n)**: All UI text MUST be in both `en` and `tr` sections of `control-panel/src/app/i18n.ts`.
3. **No Hardcoded Secrets**: Use `aetherlake-credentials` Kubernetes secret and `.env` files.
4. **Targeted Edits**: Avoid replacing whole files when making targeted fixes.
5. **Detailed Rules**: Refer to `.agent/rules/` for component-specific guidelines.

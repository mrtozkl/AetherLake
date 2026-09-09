# ⚡ AetherLake - Antigravity & Gemini Workspace Instructions

Welcome! You are operating as the Antigravity coding assistant in the AetherLake repository. This document outlines the primary development standards, workflows, and rules to follow when modifying this codebase.

---

## 🏛️ Project Overview
AetherLake is an enterprise-grade, Kubernetes-native open-source Data Lakehouse.
- **Control Panel**: Next.js 16 Web UI (React 19, TypeScript, Tailwind CSS, i18n English/Turkish, NextAuth/Keycloak). Located in [control-panel/](file:///Users/mrtozkl/Documents/open-lake/control-panel).
  - Routes: `/` (Overview), `/observability` (Pod logs & metrics), `/tables` (Iceberg explorer & preview), `/query` (Trino SQL IDE), `/kafka` (KRaft cluster & topics), `/flink` (Streaming studio), `/dbt` (Interactive React Flow Lineage DAG), `/polaris` (Iceberg REST catalog), `/trino` (Catalogs & engine).
- **MCP Server**: Stdio Model Context Protocol server (Node.js, TypeScript). Located in [mcp-server/](file:///Users/mrtozkl/Documents/open-lake/mcp-server).
- **Helm Charts**: Orchestrating Kubernetes resources (`core-data-stack` & `security-stack`). Located in [helm-charts/](file:///Users/mrtozkl/Documents/open-lake/helm-charts).
  - Multi-cloud profiles: `values-aws.yaml`, `values-azure.yaml`, `values-gcp.yaml`.
  - Monitoring Stack: Prometheus TSDB (v2.51) and pre-configured Grafana (v10.4) dashboards.
- **Pipelines**: Spark ingestion, Airflow DAGs, Flink SQL runner & bridge, dbt Medallion modeling. Located in [pipelines/](file:///Users/mrtozkl/Documents/open-lake/pipelines).
- **Terraform Stacks**: Production cloud modules for AWS (`terraform/aws/`), Azure (`terraform/azure/`), and GCP (`terraform/gcp/`).
- **Telemetry Engine**: Anonymous installation & health monitoring collector (`telemetry-collector/`, `telemetry-worker/`).

---

## 🛠️ Verification & Development Workflows

When implementing changes, you **must** verify them using the correct workspace commands.

### 1. Control Panel (Frontend)
- Run `npm install` inside [control-panel/](file:///Users/mrtozkl/Documents/open-lake/control-panel) if dependencies change.
- Verify Unit Tests, TypeScript, Linting, and Production Build:
  ```bash
  cd control-panel
  npm test         # Unit tests (i18n, auth, telemetry)
  npm run lint     # Next.js ESLint checks
  npm run build    # Production bundle compilation
  ```
- Dev Server: `npm run dev` (starts on port 3000).

### 2. MCP Server (Backend)
- Verify tool schemas and ESM compilation:
  ```bash
  cd mcp-server
  npm test         # Tool schemas & parameter enforcement
  npm run build    # TypeScript to ESM build
  ```

### 3. Helm Charts
- Run linting and template rendering checks on modified charts:
  ```bash
  cd helm-charts/core-data-stack && helm lint .
  cd helm-charts/security-stack && helm lint .
  helm template core-data-stack helm-charts/core-data-stack > /dev/null
  helm template security-stack helm-charts/security-stack > /dev/null
  ```

### 4. Data Pipelines & Transformations
- Run pipeline unit tests (DAG validation, Spark config, dbt specifications):
  ```bash
  python3 -m unittest discover -s pipelines/tests -p "test_*.py" -v
  ```

### 5. Documentation (VitePress)
- Verify documentation builds cleanly without broken links:
  ```bash
  cd docs
  npm run docs:build
  ```

---

## 📝 Critical Coding Rules

1. **Strict Types & Standards**: Always use TypeScript. Avoid `any` types. Provide full type interfaces for data payloads, API requests/responses, and Kubernetes objects.
2. **SSO & Secrets Safety**:
   > [!WARNING]
   > Never hardcode secrets, passwords, or tokens in application code. Reference the global secret `aetherlake-credentials` in Helm, and use `.env` templates / environment variables in Next.js.
3. **Internationalization (i18n)**:
   - The Control Panel is bilingual (English and Turkish).
   - Any new text added to the UI must be registered in both `en` and `tr` sections of the locale/i18n engine (`src/app/i18n.ts`).
4. **CSS & Styling**:
   - Use Tailwind CSS in the Control Panel following modern design guidelines (curated dark color palettes, responsive layouts, sleek glassmorphism with `backdrop-blur-md`, transitions with framer-motion).
   - Keep layout components reusable and separate logic from styling.

---

## 🤖 MCP Tool Interaction Rules
If you have access to the AetherLake MCP Server or local Kubernetes CLI:
- Use `get_platform_status` or `kubectl` tools to check component health before diagnosing deployment issues.
- Use `query_trino` to test and debug SQL or schema-related catalog changes directly rather than writing custom test scripts.
- Use `get_service_logs` to debug failed containers or runtime service logs.

---

## 📁 Detailed Guidelines Directory
For specific components, refer to the files in the rules directory:
- [Control Panel Standards](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/control-panel.md)
- [MCP Server SDK Guidelines](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/mcp-server.md)
- [Helm Chart Development](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/helm-charts.md)
- [Data Pipelines & DAGs](file:///Users/mrtozkl/Documents/open-lake/.agent/rules/pipelines.md)

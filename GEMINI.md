# ⚡ AetherLake - Antigravity & Gemini Workspace Instructions

Welcome! You are operating as the Antigravity coding assistant in the AetherLake repository. This document outlines the primary development standards, workflows, and rules to follow when modifying this codebase.

---

## 🏛️ Project Overview
AetherLake is a Kubernetes-native open-source Data Lakehouse.
- **Control Panel**: Next.js 16 Web UI (TypeScript, Tailwind, i18n English/Turkish, NextAuth/Keycloak). Located in [control-panel/](file:///Users/mrtozkl/Documents/open-lake/control-panel).
- **MCP Server**: Stdio Model Context Protocol server (Node.js, TypeScript). Located in [mcp-server/](file:///Users/mrtozkl/Documents/open-lake/mcp-server).
- **Helm Charts**: Orchestrating Kubernetes resources (`core-data-stack` & `security-stack`). Located in [helm-charts/](file:///Users/mrtozkl/Documents/open-lake/helm-charts).
- **Pipelines**: Spark, Airflow, and dbt configuration files. Located in [pipelines/](file:///Users/mrtozkl/Documents/open-lake/pipelines).

---

## 🛠️ Verification & Development Workflows

When implementing changes, you **must** verify them using the correct workspace commands.

### 1. Control Panel (Frontend)
- Run `npm install` inside [control-panel/](file:///Users/mrtozkl/Documents/open-lake/control-panel) if dependencies change.
- Verify TypeScript, Linting, and Production Build:
  ```bash
  cd control-panel
  npm run lint
  npm run build
  ```
- Dev Server: `npm run dev` (starts on port 3000).

### 2. MCP Server (Backend)
- Verify compilation of TypeScript to ESM:
  ```bash
  cd mcp-server
  npm run build
  ```

### 3. Helm Charts
- Run linting on modified charts:
  ```bash
  cd helm-charts/core-data-stack && helm lint .
  cd helm-charts/security-stack && helm lint .
  ```

---

## 📝 Critical Coding Rules

1. **Strict Types & Standards**: Always use TypeScript. Avoid `any` types. Provide full type interfaces for data payloads and Kubernetes objects.
2. **SSO & Secrets Safety**:
   > [!WARNING]
   > Never hardcode secrets, passwords, or tokens in application code. Reference the global secret `aetherlake-credentials` in Helm, and use `.env` templates / environment variables in Next.js.
3. **Internationalization (i18n)**:
   - The Control Panel is bilingual (English and Turkish).
   - Any new text added to the UI must be registered in both `en` and `tr` sections of the locale/i18n engine (`src/app/i18n.ts`).
4. **CSS & Styling**:
   - Use Tailwind CSS in the Control Panel following modern design guidelines (curated color palettes, responsive layouts, sleek glassmorphism, transitions with framer-motion).
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

# 🤖 AetherLake - AI Agent Instructions (AGENTS.md)

This file contains general guidelines for AI assistants (Cursor, Copilot, Windsurf, etc.) working in the AetherLake workspace to ensure consistency, safety, and high-quality code.

---

## 🧭 General Principles

1. **Incremental Updates**: Avoid rewriting whole files when fixing small bugs. Use target-specific edits or line-range modifications.
2. **Type Safety**: TypeScript is mandatory for Frontend (`control-panel`) and Backend (`mcp-server`). Do not use `any` type. Define clear interfaces.
3. **Double Verification**: 
   - Verify changes build successfully (`npm run build`).
   - Run tests or linters if available before declaring task completion.
4. **Environment Isolation**: Always assume deployment is running on Kubernetes in a local namespace (`aetherlake`) or production environment. Do not use hardcoded paths outside the workspace.

---

## 🔒 Security Best Practices

> [!CAUTION]
> **No Secrets in Git:** Do not commit API keys, client secrets, passwords, or certificates to the repository. Use Kubernetes Secrets or `.env` files.
- The repository contains dummy credentials for easy local testing. Ensure all modifications respect the isolation of production environments.
- NextAuth configuration (`NEXTAUTH_SECRET`) must be provided via env variables.

---

## 💻 Style Conventions

- **Frontend (React/Next.js)**: Use React Functional Components, Tailwind CSS, clean layouts, and standard hooks. Ensure all page designs are premium and visually outstanding. Avoid default browser styles and unstyled placeholders.
- **Helm Charts**: Maintain clean indentation, comment configuration logic inside `values.yaml`, and write reusable helper templates.
- **MCP Server**: Build standard Model Context Protocol tools with strict input validation schema (using JSON schema definition).

---

## 🔍 Navigation and Context
- Main configuration variables are controlled via [helm-charts/core-data-stack/values.yaml](file:///Users/mrtozkl/Documents/open-lake/helm-charts/core-data-stack/values.yaml).
- Frontend client views are located in [control-panel/src/app/](file:///Users/mrtozkl/Documents/open-lake/control-panel/src/app).
- MCP tool logic resides in [mcp-server/src/](file:///Users/mrtozkl/Documents/open-lake/mcp-server/src).

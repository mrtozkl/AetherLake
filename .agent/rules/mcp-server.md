# 🤖 MCP Server Development Standards

This document defines guidelines for expanding, modifying, and debugging the AetherLake Model Context Protocol (MCP) Server.

---

## 🏗️ Architecture & Stack

- **Standard**: Model Context Protocol (MCP) v1.x (Stdio transport client-server integration)
- **Library**: `@modelcontextprotocol/sdk`
- **Kubernetes Client**: `@kubernetes/client-node`
- **Runtime**: Node.js ESM (`type: module` in `package.json`)
- **Language**: TypeScript (Compiled to `dist/index.js`)

---

## 🛠️ Registered Tools Reference

The server exposes 7 core administrative and querying tools:
1. `get_platform_status`: Returns current pod phases and start times across the lakehouse namespace.
2. `get_service_logs`: Retrieves recent container logs for a given service pod name (`tailLines`).
3. `restart_service`: Triggers service pod recreation via Kubernetes label selectors.
4. `query_trino`: Executes SQL statements against Trino over authenticated TLS.
5. `list_catalogs`: Lists Iceberg REST catalogs via the Apache Polaris REST API.
6. `list_airflow_dags`: Fetches configured Airflow DAGs and operational statuses.
7. `trigger_airflow_dag`: Submits a DAG run execution request to the Airflow API.

---

## 🔒 Security, Logging & Authentication

- **Console Pollution**: 
  > [!CAUTION]
  > Because the MCP Server communicates with AI assistants via standard input/output (`stdio`), you must **NEVER** use `console.log` for debugging statements. Use `console.error` to avoid corrupting MCP JSON-RPC protocol packets.
- **Trino Authentication**: Trino requires HTTPS and Basic Authentication (`TRINO_BASIC_AUTH=mcp:<password>`). Ensure `NODE_EXTRA_CA_CERTS` points to the AetherLake cluster CA certificate when connecting externally.
- **Airflow Authentication**: Airflow requires explicit credentials via `AIRFLOW_AUTH=user:password`.
- **Sensitive Data**: Strip authorization headers, API keys, and raw secrets from tool payloads before returning them.

---

## 🚀 Build and Test Workflows

1. **Unit Testing**: Run test suites validating schemas and authentication checks:
   ```bash
   cd mcp-server
   npm test
   ```
2. **Compilation**: Compile TypeScript to ESM before running or testing with clients:
   ```bash
   cd mcp-server
   npm run build
   ```

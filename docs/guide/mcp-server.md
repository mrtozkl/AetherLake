# MCP Server (For AI Assistants)

AetherLake includes a built-in **Model Context Protocol (MCP)** server, allowing AI assistants like Claude, Cursor, or Windsurf to directly interact with your data platform.

## Supported Tools

- `get_platform_status`: Check the health of all AetherLake components.
- `get_service_logs`: Fetch real-time logs from any service (e.g., Trino, Airflow).
- `restart_service`: Safely restart a specific component.
- `query_trino`: Execute SQL queries against your Data Lakehouse.
- `list_catalogs`: View Iceberg catalogs via Apache Polaris.
- `list_airflow_dags` / `trigger_airflow_dag`: Manage your data pipelines.

## Configuring Claude Desktop

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aetherlake": {
      "command": "node",
      "args": ["/path/to/AetherLake/mcp-server/dist/index.js"],
      "env": {
        "AETHERLAKE_NAMESPACE": "aetherlake",
        "TRINO_URL": "http://trino.aetherlake.local",
        "POLARIS_URL": "http://polaris.aetherlake.local",
        "AIRFLOW_URL": "http://airflow.aetherlake.local"
      }
    }
  }
}
```

Make sure to run `npm install` and `npm run build` in the `mcp-server` directory first.

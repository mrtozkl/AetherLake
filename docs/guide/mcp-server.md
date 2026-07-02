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
        "TRINO_BASIC_AUTH": "trino:your-trino-ingress-password",
        "POLARIS_URL": "http://polaris.aetherlake.local",
        "AIRFLOW_URL": "http://airflow.aetherlake.local",
        "AIRFLOW_AUTH": "admin:your-airflow-password"
      }
    }
  }
}
```

Make sure to run `npm install` and `npm run build` in the `mcp-server` directory first.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AETHERLAKE_NAMESPACE` | `aetherlake` | Kubernetes namespace to operate against |
| `TRINO_URL` | `http://trino.aetherlake.local` | Trino coordinator base URL |
| `TRINO_BASIC_AUTH` | *(unset)* | `trino:<password>` for the basic-auth gate on the Trino ingress (`trino-ingress-password` key in `aetherlake-credentials`). Not needed when `TRINO_URL` points at the in-cluster service |
| `POLARIS_URL` | `http://polaris.aetherlake.local` | Apache Polaris REST catalog base URL |
| `AIRFLOW_URL` | `http://airflow.aetherlake.local` | Airflow webserver base URL |
| `AIRFLOW_AUTH` | *(required for Airflow tools)* | Airflow basic-auth `user:password`, used for DAG operations |

> [!NOTE]
> `AIRFLOW_AUTH` has no default. The Airflow tools (`list_airflow_dags`,
> `trigger_airflow_dag`) return a clear error until it is set.

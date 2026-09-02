# MCP Server (For AI Assistants)

AetherLake includes a built-in **Model Context Protocol (MCP)** server, allowing AI assistants like Claude, Cursor, or Windsurf to directly interact with your data platform.

## Supported Tools

| Tool | Purpose | Key Inputs |
|------|---------|------------|
| `get_platform_status` | Returns running phase and uptime of all pods in the lakehouse namespace | None |
| `get_service_logs` | Fetches real-time log lines from any service pod (Trino, MinIO, Airflow, etc.) | `service` (string), `lines` (number, default 100) |
| `restart_service` | Safely restarts component pods via Kubernetes label selector | `serviceLabel` (string, e.g. `app.kubernetes.io/name=trino`) |
| `query_trino` | Runs SQL statements directly against Trino over authenticated TLS | `query` (string) |
| `list_catalogs` | Queries Polaris REST catalog API to return registered Iceberg catalogs | None |
| `list_airflow_dags` | Retrieves status and metadata for all orchestrated Airflow DAGs | None |
| `trigger_airflow_dag` | Triggers immediate execution of a specific Airflow pipeline run | `dag_id` (string) |

---

## Client Configurations

### 1. Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "aetherlake": {
      "command": "node",
      "args": ["/absolute/path/to/AetherLake/mcp-server/dist/index.js"],
      "env": {
        "AETHERLAKE_NAMESPACE": "aetherlake",
        "TRINO_URL": "https://localhost:8443",
        "TRINO_BASIC_AUTH": "mcp:<trino-mcp-password>",
        "NODE_EXTRA_CA_CERTS": "/Users/<you>/.aetherlake-ca.crt",
        "POLARIS_URL": "http://polaris.aetherlake.local",
        "AIRFLOW_URL": "http://airflow.aetherlake.local",
        "AIRFLOW_AUTH": "admin:your-airflow-password"
      }
    }
  }
}
```

### 2. Cursor IDE
Add to `.cursor/mcp.json` in your workspace or global Cursor settings:

```json
{
  "mcpServers": {
    "aetherlake": {
      "command": "node",
      "args": ["/absolute/path/to/AetherLake/mcp-server/dist/index.js"],
      "env": {
        "AETHERLAKE_NAMESPACE": "aetherlake",
        "TRINO_URL": "https://localhost:8443",
        "TRINO_BASIC_AUTH": "mcp:<trino-mcp-password>",
        "NODE_EXTRA_CA_CERTS": "/Users/<you>/.aetherlake-ca.crt"
      }
    }
  }
}
```

### 3. Windsurf
Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "aetherlake": {
      "command": "node",
      "args": ["/absolute/path/to/AetherLake/mcp-server/dist/index.js"],
      "env": {
        "AETHERLAKE_NAMESPACE": "aetherlake",
        "TRINO_URL": "https://localhost:8443",
        "TRINO_BASIC_AUTH": "mcp:<trino-mcp-password>",
        "NODE_EXTRA_CA_CERTS": "/Users/<you>/.aetherlake-ca.crt"
      }
    }
  }
}
```

### 4. Google Antigravity & Gemini CLI
Add directly via CLI command:

```bash
agy mcp add aetherlake -- node /absolute/path/to/AetherLake/mcp-server/dist/index.js
```

---

## Local Setup & Port Forwarding

Before launching your AI assistant:

```bash
# 1. Build the MCP server TypeScript to ESM
cd mcp-server
npm install
npm run build

# 2. Port-forward Trino TLS (keep running in background):
kubectl port-forward -n aetherlake svc/core-data-stack-trino 8443:8443

# 3. Export the Trino mcp password:
kubectl get secret aetherlake-credentials -n aetherlake \
  -o jsonpath='{.data.trino-mcp-password}' | base64 -d

# 4. Export the AetherLake Root CA (for TLS verification):
kubectl get secret aetherlake-root-ca -n cert-manager \
  -o jsonpath='{.data.ca\.crt}' | base64 -d > ~/.aetherlake-ca.crt
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AETHERLAKE_NAMESPACE` | `aetherlake` | Kubernetes namespace to operate against |
| `TRINO_URL` | `http://trino.aetherlake.local` | Trino coordinator base URL. The ingress host is gated by Keycloak SSO (oauth2-proxy), which non-interactive clients cannot pass, and Trino itself only accepts authenticated TLS — use `https://core-data-stack-trino:8443` in-cluster or an 8443 port-forward |
| `TRINO_BASIC_AUTH` | *(required for Trino tools)* | `user:password` for Trino's PASSWORD (file) authenticator — Trino rejects unauthenticated requests. Use `mcp:<trino-mcp-password>`; the `mcp` user is read-only ([Trino — Authorization](./components/trino#authorization-per-role-access-control)) |
| `NODE_EXTRA_CA_CERTS` | *(unset)* | Path to the AetherLake root CA (`aetherlake-root-ca` secret in `cert-manager`), required for `https://` Trino URLs |
| `POLARIS_URL` | `http://polaris.aetherlake.local` | Apache Polaris REST catalog base URL |
| `AIRFLOW_URL` | `http://airflow.aetherlake.local` | Airflow webserver base URL |
| `AIRFLOW_AUTH` | *(required for Airflow tools)* | Airflow basic-auth `user:password`, used for DAG operations |

> [!NOTE]
> `AIRFLOW_AUTH` has no default. The Airflow tools (`list_airflow_dags`,
> `trigger_airflow_dag`) return a clear error until it is set.

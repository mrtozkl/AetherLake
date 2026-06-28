# Components

The platform consists of several curated open-source projects. Each has a
detailed reference page (settings, architecture, gotchas) under **Component
Reference** in the sidebar.

| Component | Role | Version | Reference |
|-----------|------|---------|-----------|
| **[Keycloak](https://www.keycloak.org/)** | Identity & SSO (OIDC) | 26.3.3 | [Keycloak — SSO](./components/keycloak) |
| **[MinIO](https://min.io/)** | S3-compatible object storage | RELEASE.2025-04-08 | [MinIO — Storage](./components/minio) |
| **[Trino](https://trino.io/)** | Distributed SQL query engine | 480 (chart 1.42.2) | [Trino — Query](./components/trino) |
| **[Apache Polaris](https://polaris.apache.org/)** | Iceberg REST catalog + vending | latest | [Polaris — Catalog](./components/polaris) |
| **[Apache Airflow](https://airflow.apache.org/)** | Workflow orchestration | 2.10.5 (chart 1.16.0) | [Airflow — Orchestration](./components/airflow) |
| **[Apache Superset](https://superset.apache.org/)** | BI & dashboards | 3.1.2 (chart 0.12.8) | [Superset — BI](./components/superset) |
| **[Apache Spark](https://spark.apache.org/)** | Distributed data processing | operator 1.1.27 | [Spark — Processing](./components/spark) |
| **[Milvus](https://milvus.io/)** | Vector similarity search | chart 5.0.14 | [Milvus — Vector DB](./components/milvus) ⚠️ |
| **[dbt](https://www.getdbt.com/)** | SQL-based data transformation | — | [Data Pipelines](./pipelines) |
| **Control Panel** | Web UI for platform management | — | [Control Panel](./control-panel) |
| **MCP Server** | Agent tooling (K8s/Trino/Polaris/Airflow) | — | [MCP Server](./mcp-server) |

> ⚠️ **Milvus** is the one component not yet operational — Milvus 2.6.11's
> mandatory streaming node has an upstream chunk-manager incompatibility with
> this chart. See its [reference page](./components/milvus) for the full
> diagnosis and the planned fix.

## Helm chart layout

| Chart | Components |
|-------|-----------|
| **`security-stack`** | Keycloak + keycloak-postgres |
| **`core-data-stack`** | MinIO, Trino, Polaris, Spark, Airflow, Superset, Milvus, shared postgres/redis |

## Shared infrastructure

- **`aetherlake-postgres`** — one shared PostgreSQL hosting the `airflow`,
  `superset` and `polaris` databases (Keycloak has its own `keycloak-postgres`).
- **`aetherlake-credentials`** / **`open-lake-credentials`** — the Kubernetes
  Secret(s) holding all randomized credentials (see
  [Configuration Guide](./configuration)).

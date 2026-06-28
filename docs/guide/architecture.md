# Architecture

AetherLake is a decoupled, microservices-oriented data lakehouse running entirely
on Kubernetes. It is split into two Helm charts:

- **`security-stack`** — Keycloak (OIDC/SSO) + its PostgreSQL.
- **`core-data-stack`** — MinIO, Trino, Apache Polaris, Apache Spark, Apache
  Airflow, Apache Superset, Milvus, and the shared PostgreSQL/Redis.

## System overview

```mermaid
graph TD
    subgraph ingress["NGINX Ingress (*.aetherlake.local)"]
    end

    subgraph sec["security-stack"]
        KC[Keycloak 26<br/>OIDC / SSO]
        KCPG[(keycloak-postgres)]
        KC --- KCPG
    end

    subgraph core["core-data-stack"]
        MinIO[MinIO<br/>S3 Object Storage]
        Trino[Trino 480<br/>Federated SQL]
        Polaris[Apache Polaris<br/>Iceberg REST Catalog]
        Spark[Spark Operator]
        Airflow[Apache Airflow<br/>Orchestration]
        Superset[Apache Superset<br/>BI / Dashboards]
        Milvus[Milvus<br/>Vector DB]
        PG[(aetherlake-postgres<br/>shared)]

        Trino -->|Iceberg REST| Polaris
        Polaris -->|metadata| PG
        Trino -->|S3| MinIO
        Polaris -->|vended S3 creds| MinIO
        Milvus -->|external S3| MinIO
        Airflow --> PG
        Superset --> PG
        Superset -->|SQLAlchemy| Trino
        Spark --> MinIO
    end

    ingress --> KC
    ingress --> MinIO
    ingress --> Trino
    ingress --> Polaris
    ingress --> Airflow
    ingress --> Superset
    ingress --> Milvus
```

## Layers

| Layer | Component(s) | Responsibility |
|-------|--------------|----------------|
| **Identity** | Keycloak | Single sign-on, OIDC clients, realm roles |
| **Storage** | MinIO | S3-compatible object storage (Iceberg data, vectors, raw files) |
| **Catalog** | Apache Polaris | Iceberg REST catalog + S3 credential vending |
| **Query** | Trino | Federated SQL over the Iceberg catalog and other sources |
| **Processing** | Apache Spark | Distributed batch processing |
| **Orchestration** | Apache Airflow | DAG-based pipeline scheduling |
| **Analytics / BI** | Apache Superset | Dashboards and SQL exploration over Trino |
| **Vector search** | Milvus | Similarity search for AI/ML workloads |
| **Control** | Control Panel, MCP Server | Management UI + agent tooling |

## SSO / OIDC flow

Every service authenticates against the single `aetherlake` Keycloak realm. The
token issuer is `http://keycloak.aetherlake.local/realms/aetherlake`.

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Service
    participant KC as Keycloak
    U->>S: Access UI
    S->>U: Redirect to Keycloak (authorize_url)
    U->>KC: Login at keycloak.aetherlake.local
    KC->>U: Authorization code
    U->>S: Authorization code
    S->>KC: Exchange code (server-side, in-cluster DNS)
    KC->>S: ID + access token (with realm roles)
    S->>S: Map realm roles to app roles
```

::: warning In-cluster DNS
`keycloak.aetherlake.local` is an ingress host and does **not** resolve via
cluster DNS by default, so server-side OIDC discovery (MinIO, Superset, Airflow,
Polaris) would fail. `install.sh` adds a CoreDNS rewrite mapping that hostname to
the Keycloak Service, keeping in-cluster discovery and browser redirects
consistent. See [Keycloak / SSO](./components/keycloak).
:::

## Lakehouse write path (Trino → Polaris → MinIO)

```mermaid
sequenceDiagram
    participant T as Trino
    participant P as Polaris
    participant M as MinIO (S3 + STS)
    T->>P: createTable (Iceberg REST, OAuth2)
    P->>M: AssumeRole (STS, minio-polaris user)
    M->>P: Scoped temporary credentials
    P->>T: Vended credentials + metadata location
    T->>M: Write data + metadata (path-style S3)
```

This **credential vending (subscoping)** path gives each query short-lived,
table-scoped S3 credentials instead of long-lived root keys. See
[Apache Polaris](./components/polaris).

## Next

- [Components overview](./components) — one-line summary + status of each service.
- Per-component reference pages with every setting live under **Component
  Reference** in the sidebar.

<p align="center">
  <img src="https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white" alt="Kubernetes" />
  <img src="https://img.shields.io/badge/Helm-0F1689?style=for-the-badge&logo=helm&logoColor=white" alt="Helm" />
  <img src="https://img.shields.io/badge/Apache%20Iceberg-4E8EE9?style=for-the-badge" alt="Iceberg" />
  <img src="https://img.shields.io/badge/Trino-DD00A1?style=for-the-badge&logo=trino&logoColor=white" alt="Trino" />
  <img src="https://img.shields.io/badge/Apache%20Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" alt="Kafka" />
  <img src="https://img.shields.io/badge/Apache%20Flink-E6526F?style=for-the-badge&logo=apacheflink&logoColor=white" alt="Flink" />
  <img src="https://img.shields.io/badge/dbt-FF694B?style=for-the-badge&logo=dbt&logoColor=white" alt="dbt" />
  <img src="https://img.shields.io/badge/License-BUSL%201.1-blue?style=for-the-badge" alt="License" />
</p>

<h1 align="center">🌊 AetherLake — Open-Source Data Lakehouse on Kubernetes</h1>

<p align="center">
  <img src="assets/dashboard.png" alt="AetherLake Dashboard" />
</p>

<p align="center">
  Storage, catalog, query, streaming, BI and identity — one <code>helm install</code>.<br/>
  <a href="#-quick-start">Quick Start</a> · <a href="#-components">Components</a> · <a href="#-streaming-kafka--flink">Streaming</a> · <a href="#-dbt-lakehouse-transformations">dbt</a> · <a href="#-single-sign-on">SSO</a> · <a href="#-configuration">Configuration</a>
</p>

---

## ✨ What is AetherLake?

A batteries-included, Kubernetes-native data lakehouse that glues best-in-class
open-source components into one platform: S3 storage, an Iceberg REST catalog,
federated SQL, stream processing, orchestration, BI and centralized identity —
managed from a single web Control Panel.

- 🏗️ **Modular** — every component behind a single `values.yaml` toggle
- 🔐 **Secure by default** — Keycloak SSO for every UI, random per-install secrets
- 🌊 **Streaming** — Kafka (Strimzi) + Flink SQL jobs, queryable from Trino
- 🔄 **dbt Lakehouse** — Medallion modeling (Bronze → Silver → Gold) with visual DAG Lineage
- 🎛️ **Unified control** — Next.js Control Panel (EN/TR) for status, SQL, catalogs, Kafka, Flink, and dbt

---

## 🏛️ Architecture

```
                        *.aetherlake.local (nginx ingress)
                        │  oauth2-proxy gate (Keycloak SSO)
                        │  for UIs without native OIDC
   ┌────────────────────┼───────────────────────────────────────┐
   │  aetherlake ns     ▼                                       │
   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐ │
   │  │ MinIO    │ │ Trino    │ │ Polaris  │ │ Control Panel │ │
   │  │ storage  │◄ SQL +    │ │ Iceberg  │ │ Next.js (SSO) │ │ │
   │  │          │ │ kafka cat│ │ REST cat │ └───────────────┘ │ │
   │  └──────────┘ └────▲─────┘ └──────────                   │ │
   │                    │ queries                              │ │
   │  ┌────────── ┌────┴─────┐ ┌──────────┐ ┌───────────────┐ │ │
   │  │ Kafka    │◄ Flink    │ │ Airflow  │ │ Superset (SSO)│ │ │
   │  │ Strimzi  │ │ SQL jobs │ │ (SSO)    │ │ Milvus/Attu   │ │ │
   │  │ +external│ └────────── └──────────┘ └───────────────┘ │ │
   │  │ SCRAM    │                                             │ │
   │  └──────────┘ ┌─────────────────────────────────────────┐ │ │
   │               │ Keycloak — realm aetherlake, OIDC SSO   │ │ │
   │               └─────────────────────────────────────────┘ │ │
   └────────────────────────────────────────────────────────────┘
```

Per-component deep dives (settings, diagrams, operations) live in
[`docs/guide/components/`](docs/guide/components/).

---

## 📦 Components

| Component | Role | Version |
|-----------|------|---------|
| [Keycloak](https://www.keycloak.org/) | Identity & SSO (OIDC) | 26.3.3 |
| [MinIO](https://min.io/) | S3-compatible object storage | Operator tenant |
| [Trino](https://trino.io/) | Federated SQL (Iceberg + Kafka catalogs) | 480 |
| [Apache Polaris](https://polaris.apache.org/) | Iceberg REST catalog | Postgres metastore |
| [Apache Kafka](https://kafka.apache.org/) | Streaming (Strimzi, KRaft) | 4.3.0 |
| [Apache Flink](https://flink.apache.org/) | Stream processing (SQL jobs) | 2.1 / Operator 1.15 |
| [dbt](https://www.getdbt.com/) | Medallion modeling & Lineage | 1.8 (dbt-trino) |
| [Apache Airflow](https://airflow.apache.org/) | Orchestration | 2.10.5 |
| [Apache Superset](https://superset.apache.org/) | BI & dashboards | 3.1.2 |
| [Apache Spark](https://spark.apache.org/) | Batch processing | Operator 1.1.27 |
| [Milvus](https://milvus.io/) | Vector search | chart 5.0.14 |
| PostgreSQL | Metadata stores | 16 |
| Control Panel | Platform UI (Next.js) | EN/TR |

---

## 🚀 Quick Start

**Prerequisites:** Kubernetes (Docker Desktop / minikube / kind), Helm ≥ 3.12,
kubectl, Docker (the installer builds the Flink SQL runner image), an NGINX
ingress controller (the installer installs one if missing).

```bash
git clone https://github.com/mrtozkl/AetherLake.git && cd AetherLake
./install.sh
```

Add local DNS entries:

```
127.0.0.1  minio.aetherlake.local trino.aetherlake.local polaris.aetherlake.local
127.0.0.1  keycloak.aetherlake.local airflow.aetherlake.local superset.aetherlake.local
127.0.0.1  milvus.aetherlake.local oauth2.aetherlake.local
```

| Service | URL | Auth |
|---------|-----|------|
| Control Panel | `http://localhost:3000` | dev login `admin`/`admin` (local dev only) |
| Trino UI | `http://trino.aetherlake.local` | Keycloak SSO |
| Milvus (Attu) | `http://milvus.aetherlake.local` | Keycloak SSO |
| MinIO Console | `http://minio.aetherlake.local` | Keycloak OIDC |
| Airflow | `http://airflow.aetherlake.local` | Keycloak OIDC |
| Superset | `http://superset.aetherlake.local` | Keycloak OIDC |
| Keycloak | `http://keycloak.aetherlake.local` | admin (secret) |

All credentials are randomly generated into `aetherlake-credentials`:

```bash
kubectl get secret aetherlake-credentials -n aetherlake \
  -o jsonpath='{.data.realm-admin-password}' | base64 -d   # SSO admin (change on first login)
```

Every host is also served over TLS with a self-signed CA (cert-manager);
plain HTTP stays on because the SSO issuer URLs are `http://`.

---

## 🎛️ Control Panel

A unified web console built with Next.js 16 (Turbopack, TypeScript, Tailwind CSS) providing centralized platform visibility and operations:

<p align="center">
  <img src="assets/dashboard.png" alt="Overview Dashboard" width="49%" />
  <img src="assets/dbt.png" alt="dbt Lakehouse Workspace" width="49%" />
</p>
<p align="center">
  <img src="assets/flink.png" alt="Flink SQL Workspace" width="49%" />
  <img src="assets/kafka.png" alt="Kafka Management" width="49%" />
</p>

- **Overview** — pod health, restarts, memory/CPU usage, and one-click service restarts
- **dbt Workspace & Lineage** — interactive DAG graph (Bronze → Silver → Gold), model inspector, Monaco SQL viewer, and run triggers
- **Kafka** — KRaft cluster status, broker readiness, topics (partitions, replicas, configs, and conditions)
- **Flink SQL** — interactive streaming workspace: topic explorer, Monaco SQL editor, job submission, and live status
- **SQL IDE** — federated Trino queries with schema tree explorer across Iceberg and Kafka catalogs
- **Iceberg Tables & Catalogs** — explore Polaris namespaces, table schemas, snapshots, and partition metadata
- **Observability** — live container logs, Kubernetes events, and detailed pod metrics
- **i18n & RBAC** — bilingual (English/Turkish) with role-based action gating (`data-admin`, `data-scientist`, `data-engineer`)

```bash
cd control-panel && npm install && npm run dev   # → http://localhost:3000
```

---

## 🔄 dbt Lakehouse Transformations

Transform raw data using the Medallion Architecture (`pipelines/dbt/`):

- **Bronze (Raw):** Clickstream (`user_events`) and sensor data (`telemetry_stream`) landed via Kafka and Flink.
- **Silver (Curated):** Cleansed and partitioned Parquet Iceberg tables (`stg_user_events`, `stg_users`).
- **Gold (Marts):** Aggregated metrics and dimensional marts (`fct_daily_user_metrics`, `fct_event_summary`) consumed by Superset and Trino.

```bash
cd pipelines/dbt
dbt run --profiles-dir .
dbt test --profiles-dir .
```

---

## 🌊 Streaming: Kafka + Flink

Enable with `kafka.enabled` / `flink.enabled` (both default `true`).

- **Kafka (KRaft Mode):** Provisioned by Strimzi 1.1.0 with a pre-configured `events` topic; Flink SQL jobs produce/consume topics via the built-in Kafka connector (`pipelines/flink/examples/`).
- **Flink SQL Runner:** Each submission creates an isolated application-mode `FlinkDeployment` mini-cluster using `aetherlake/flink-sql-runner:flink-2.1` built by `install.sh`.
- **Kafka → Iceberg Lakehouse Bridge:** Continuous streaming ETL from Kafka topics directly into Apache Iceberg tables via Polaris REST catalog and MinIO S3FileIO (`pipelines/flink/examples/kafka-to-iceberg.sql`). Platform credentials (`POLARIS_CREDENTIAL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`) are dynamically injected and resolved via `${ENV:...}` placeholders.
- **Kafka in Trino:** Topics queryable directly as SQL tables via `SELECT * FROM kafka.aetherlake.events` (configured in `trino.kafka.tableDescriptions`).

### Producing from outside the cluster

The `external` listener (TLS + SCRAM-SHA-512, nodeport) accepts authenticated
clients; credentials live in the `external-producer` KafkaUser secret:

```bash
NODEPORT=$(kubectl get svc aetherlake-kafka-external-bootstrap -n aetherlake \
  -o jsonpath='{.spec.ports[0].nodePort}')
kubectl get secret aetherlake-cluster-ca-cert -n aetherlake \
  -o jsonpath='{.data.ca\.crt}' | base64 -d > cluster-ca.crt      # TLS truststore
kubectl get secret external-producer -n aetherlake \
  -o jsonpath='{.data.sasl\.jaas\.config}' | base64 -d            # sasl.jaas.config value
```

Client properties (`localhost:$NODEPORT` on Docker Desktop):

```properties
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=<value from the secret>
ssl.truststore.location=<truststore built from cluster-ca.crt>
ssl.truststore.password=<truststore password>
```

Full recipe (truststore build, console producer/consumer examples):
[docs/guide/components/kafka.md](docs/guide/components/kafka.md#producing-from-outside-the-cluster).

---

## 🔐 Single Sign-On

Keycloak realm `aetherlake` with OIDC clients per service. Apps with native
OIDC (Superset, Airflow, MinIO) log in directly; UIs without one (Trino,
Milvus/Attu) are gated by **oauth2-proxy** through nginx external auth — one
Keycloak login, shared `*.aetherlake.local` session.

| Client | Used by |
|--------|---------|
| `aetherlake-client` | Control Panel (NextAuth) |
| `oauth2-proxy` | SSO gate for Trino UI & Milvus Attu |
| `superset` / `airflow` / `minio` | native OIDC apps |
| `polaris` | catalog token issuance |

Realm roles: `data-admin`, `data-scientist`, `data-engineer`.

---

## ⚙️ Configuration

Component toggles in `helm-charts/core-data-stack/values.yaml`:

```yaml
kafka:
  enabled: true
  external:            # authenticated (SCRAM) access from outside the cluster
    enabled: true
flink:
  enabled: true
trino:
  enabled: true
  server:
    workers: 2
airflow:
  enabled: false       # disable anything you don't need
```

Secrets: everything reads from `aetherlake-credentials` /
`open-lake-credentials` (random per install; re-runs backfill missing keys).
Storage: MinIO tenant (`minio.*`: servers, volumes, `initBuckets`).

---

## 🤖 MCP Server

AI assistants (Claude, Cursor, …) can operate the platform via
[`mcp-server/`](mcp-server/): platform status, service logs/restarts, Trino
queries, Polaris catalogs, Airflow DAGs. Build with
`npm install && npm run build`, then point your MCP client at
`mcp-server/dist/index.js` (see `mcp-server/README.md` for the config block).

---

## 📁 Project Structure

```
├── control-panel/        # Next.js UI (overview, kafka, flink, sql ide, …)
├── helm-charts/
│   ├── core-data-stack/  # data infra chart (+ vendored subcharts)
│   └── security-stack/   # Keycloak + realm/OIDC provisioning
├── mcp-server/           # MCP tools for AI assistants
├── pipelines/            # airflow dags, spark, flink sql-runner + examples, dbt
├── docs/                 # component reference & guides
├── aetherlake-ingress.yaml
└── install.sh
```

---

## 🗺️ Roadmap

- [ ] Terraform / Pulumi modules · Grafana + Prometheus stack
- [ ] Apache Ranger policies · lineage UI · multi-cluster federation
- [ ] GitOps (ArgoCD) · automated backups · chart on an artifact registry

---

## 🚨 Security & Production Readiness

Credentials are random per install and the Control Panel refuses to start in
production without `NEXTAUTH_SECRET` / `KEYCLOAK_CLIENT_SECRET`. Before
exposing a cluster: review placeholder values in chart `values.yaml`, set the
Control Panel env vars, override the MCP server's `AIRFLOW_AUTH`, and use real
TLS certificates on the ingress.

---

## 🤝 Contributing

Fork → branch → commit → PR. Chart changes must pass `helm lint`; Control
Panel changes must pass `npm run build`; update docs with your change.

## 📄 License

**BUSL-1.1** — free to use, modify and self-host internally; commercial
hosted/managed offerings require a license (see [LICENSE](LICENSE)). Converts
to Apache-2.0 four years after each release. Third-party components keep their
own licenses — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

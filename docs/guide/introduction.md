# What is AetherLake?

AetherLake is a **batteries-included, Kubernetes-native Data Lakehouse** that brings together best-in-class open-source tools into a single, cohesive platform. Instead of spending weeks gluing together storage, compute, catalog, orchestration, and security layers — deploy everything in minutes.

## Key principles

- 🏗️ **Modular** — Enable or disable any component via a single toggle
- 🔐 **Secure by default** — One Keycloak login for every UI (native OIDC or an
  oauth2-proxy gate), RBAC realm roles, random per-install secrets, TLS via
  cert-manager
- 🌊 **Streaming included** — Kafka (Strimzi, KRaft) and Flink SQL jobs are part
  of the platform, with topics queryable through Trino
- 📦 **Cloud-native** — Helm charts, Kubernetes operators, and S3-compatible storage
- 🎛️ **Unified control** — Web-based Control Panel to manage the entire platform
- 🌐 **Multi-language** — Control Panel supports English and Turkish (extensible)

## Core Technologies

AetherLake integrates several major open-source projects:

- **Storage:** MinIO (S3 compatible, operator-managed tenant)
- **Table Format:** Apache Iceberg
- **Catalog:** Apache Polaris (REST Catalog with S3 credential vending)
- **Compute:** Trino & Apache Spark
- **Streaming:** Apache Kafka (Strimzi) & Apache Flink (SQL jobs)
- **Orchestration:** Apache Airflow
- **Analytics / BI:** Apache Superset
- **Vector DB:** Milvus
- **Identity:** Keycloak (SSO for every service UI)

## What you can do with it

- **Query everything with SQL** — Iceberg tables, Kafka topics, and external
  databases from one Trino endpoint or the Control Panel SQL IDE.
- **Stream into the lakehouse** — Flink SQL jobs read/write Kafka topics from
  the browser; produce from outside the cluster over an authenticated
  (TLS + SCRAM-SHA-512) listener.
- **Explore the catalog** — browse Iceberg schemas, tables, partitions and
  snapshots; manage Polaris namespaces and Trino catalogs from the UI.
- **Operate the cluster** — pod overview, live logs, Kubernetes events and
  CPU/RAM metrics without leaving the Control Panel.
- **Automate with agents** — the bundled MCP server exposes platform status,
  Trino queries, Polaris catalogs and Airflow DAGs to AI assistants.

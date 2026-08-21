# dbt — Data Transformations & Modeling

dbt (data build tool) manages SQL-first data transformations in the AetherLake
Lakehouse using the Medallion Architecture (Bronze → Silver → Gold). Models run
on top of **Trino** over TLS (`dbt-trino`), writing Parquet files to MinIO S3 and
registering tables in the **Apache Polaris** Iceberg REST catalog.

- **Profile:** `pipelines/dbt/profiles.yml` (`lakehouse_trino`)
- **Adapter:** `dbt-trino` connecting via Trino HTTPS port `8443`
- **Catalog:** Apache Iceberg catalog managed by Polaris REST
- **Control Panel:** Interactive `/dbt` workspace (Lineage DAG, Model Inspector, Run Triggers, and Test Reports)

---

## 🏛️ Medallion Architecture Flow

```mermaid
graph LR
    subgraph Bronze ["1. Bronze (Raw Ingestion)"]
        B1[bronze.user_events<br/>Kafka / Flink streaming]
        B2[bronze.telemetry_stream<br/>MinIO sensor logs]
    end

    subgraph Silver ["2. Silver (Curated & Cleansed)"]
        S1[stg_user_events<br/>Deduplicated, Parquet]
        S2[stg_users<br/>User dimension tiers]
    end

    subgraph Gold ["3. Gold (Analytics & Marts)"]
        G1[fct_daily_user_metrics<br/>Aggregated daily BI]
        G2[fct_event_summary<br/>Enriched event dimensions]
    end

    B1 --> S1
    S1 --> S2
    S1 --> G1
    S1 --> G2
    S2 --> G2
```

---

## 🎛️ Control Panel Workspace

The `/dbt` page in the Control Panel provides a full-featured web interface:

![dbt Lakehouse Workspace](/dbt.png)

1. **Interactive Data Lineage (DAG)**:
   - Visual dependency graph from Bronze sources to Silver staging models and Gold analytics marts.
   - Interactive zoom/pan controls with layer filtering and upstream/downstream dependency tracing.
2. **Model Inspector**:
   - View raw Jinja/SQL source code and compiled Trino SQL.
   - Column schemas, data types, and applied data quality tests (`unique`, `not_null`, `accepted_values`).
3. **Execution & Test Runner**:
   - One-click triggers for `dbt run` and `dbt test` against Trino.
   - Real-time run logs and execution history with durations and model statuses.

---

## 🚀 Running dbt via CLI

To run dbt transformations locally from your terminal:

```bash
cd pipelines/dbt

# Test Trino TLS connection
dbt debug --profiles-dir .

# Run all models (Bronze -> Silver -> Gold)
dbt run --profiles-dir .

# Run data quality tests
dbt test --profiles-dir .

# Run only gold layer models
dbt run --select gold --profiles-dir .
```

### Connection Configuration (`profiles.yml`)

```yaml
lakehouse_trino:
  target: dev
  outputs:
    dev:
      type: trino
      method: ldap
      host: trino.aetherlake.local
      port: 8443
      user: admin
      password: "{{ env_var('TRINO_PASSWORD', 'admin123') }}"
      database: iceberg
      schema: lakehouse_silver
      threads: 4
      http_scheme: https
      cert: ../../control-panel/.ca/aetherlake-ca.crt
```

---

## 📁 Model Structure

| Layer | Path | Purpose | Materialization |
|:---|:---|:---|:---|
| **Sources** | `models/sources.yml` | Raw bronze table definitions | Source |
| **Silver** | `models/silver/stg_user_events.sql` | Cleaned and deduplicated events | `table` (Iceberg Parquet) |
| **Silver** | `models/silver/stg_users.sql` | User lifetime metrics & tiering | `table` (Iceberg Parquet) |
| **Gold** | `models/gold/fct_daily_user_metrics.sql` | Daily aggregated metrics for Superset | `table` (Iceberg Parquet) |
| **Gold** | `models/gold/fct_event_summary.sql` | Enriched event dimension mart | `table` (Iceberg Parquet) |
| **Tests** | `models/schema.yml` | Data quality validations | `unique`, `not_null`, `accepted_values` |

---

## 🔗 Related Components

- [Trino — Federated SQL](./trino) — executes dbt transformation queries
- [Apache Polaris — Iceberg Catalog](./polaris) — manages table metadata and snapshots
- [Apache Superset — BI & Dashboards](./superset) — visualizes gold layer marts
- [Control Panel](../control-panel) — web workspace for models and lineage

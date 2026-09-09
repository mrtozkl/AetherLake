# 📊 Data Pipelines Development Standards

This document establishes conventions for data pipelines in the AetherLake workspace, covering Apache Flink, dbt, Apache Spark, and Apache Airflow.

---

## 🌊 Apache Flink Streaming Pipelines

Flink streaming jobs reside in [pipelines/flink/](file:///Users/mrtozkl/Documents/open-lake/pipelines/flink).

1. **SQL Runner Architecture**:
   - Jobs are packaged and executed using the custom Application-mode SQL runner (`pipelines/flink/sql-runner/`).
   - The runner runs on Flink 2.1 and is orchestrated by the Flink Kubernetes Operator.
2. **Environment Secret Injection**:
   - Use `${ENV:VARIABLE_NAME}` syntax inside streaming SQL files (`pipelines/flink/examples/kafka-to-iceberg.sql`) to resolve runtime credentials dynamically (e.g. `POLARIS_CREDENTIAL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`).
3. **Connectors**:
   - Real-time event consumption uses the built-in Kafka connector (`connector = 'kafka'`).
   - Lakehouse sink writes directly to Apache Iceberg tables via Polaris REST catalog (`connector = 'iceberg'`).

---

## ❄️ dbt Lakehouse Transformations

The dbt project is located in [pipelines/dbt/](file:///Users/mrtozkl/Documents/open-lake/pipelines/dbt).

1. **Medallion Architecture Structure**:
   - **Bronze (Sources)**: Raw landing tables defined in `models/sources.yml`.
   - **Silver (Staging & Cleansing)**: Cleaned, deduplicated, and typed Iceberg tables in `models/silver/`.
   - **Gold (Marts & Aggregations)**: Business metrics, dimensional models, and daily aggregations in `models/gold/`.
2. **SQL & Adapter Rules**:
   - Connect transformations using the `dbt-trino` adapter.
   - Always reference upstream models via `{{ ref(...) }}` and raw sources via `{{ source(...) }}` to maintain lineage DAG integrity.
3. **Documentation & Testing**:
   - Register columns, data types, and assertions (`unique`, `not_null`) in `models/schema.yml`.
4. **Execution**:
   ```bash
   cd pipelines/dbt
   dbt run --profiles-dir .
   dbt test --profiles-dir .
   ```

---

## ⚡ PySpark Ingestion Jobs

Spark batch ingestion definitions are located in [pipelines/spark/](file:///Users/mrtozkl/Documents/open-lake/pipelines/spark).

1. **Spark Session Configuration**:
   - Read MinIO S3 credentials and endpoint configurations from cluster-level environment properties.
   - Use Iceberg Spark extensions (`org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions`) and Polaris REST catalog when writing datasets.
2. **Robustness**:
   - Handle schema evolution, null values, and data drift gracefully.
   - Write structured status logs to stdout for observability ingestion.

---

## 🎛️ Apache Airflow DAGs

Airflow DAGs reside in [pipelines/airflow/dags/](file:///Users/mrtozkl/Documents/open-lake/pipelines/airflow/dags).

1. **Declarative TaskFlow**: Use modern TaskFlow API decorators (`@dag`, `@task`).
2. **Execution Operators**: Use `SparkKubernetesOperator` or `KubernetesPodOperator` to maintain containerized isolation.
3. **Tags & Documentation**: Always specify descriptive `tags` (e.g. `['lakehouse', 'dbt', 'ingestion']`) and docstrings.

---

## 🚀 Pipeline Testing Workflows

Run the pipeline test suite validating DAG syntax, Spark configuration, and dbt models:
```bash
python3 -m unittest discover -s pipelines/tests -p "test_*.py" -v
```

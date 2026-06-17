# 📊 Data Pipelines Development Standards

This document establishes conventions for data pipelines in the AetherLake workspace, covering Apache Airflow, Apache Spark, and dbt.

---

## 🎛️ Apache Airflow DAGs

Airflow DAGs reside in [pipelines/airflow/dags/](file:///Users/mrtozkl/Documents/open-lake/pipelines/airflow/dags).

1. **Declarative Decorators**: Use modern taskflow API decorators (`@dag`, `@task`) where possible.
2. **Metadata & Naming**:
   - Provide explicit `tags` for filtering (e.g., `['lakehouse', 'ingestion']`).
   - Define a detailed description and documentation string on each DAG.
3. **Execution Operators**:
   - When calling Spark or Kubernetes workloads, prefer Kubernetes operators (`SparkKubernetesOperator`, `KubernetesPodOperator`) to maintain process separation and scale workloads independently of the Airflow scheduler.

---

## ⚡ PySpark Ingestion Jobs

Spark ingestion definitions are located in [pipelines/spark/](file:///Users/mrtozkl/Documents/open-lake/pipelines/spark).

1. **Spark Session Configuration**:
   - Read MinIO S3 credentials and endpoint configurations from cluster-level environment properties.
   - Use correct Iceberg catalog configurations when writing datasets to Apache Iceberg tables.
2. **Robustness**:
   - Wrap schemas in try/except blocks and handle data drift or null schemas explicitly.
   - Output structured execution metrics and write logs to stdout.

---

## ❄️ dbt Transformations

The dbt project is located in [pipelines/dbt/](file:///Users/mrtozkl/Documents/open-lake/pipelines/dbt).

1. **SQL Development**:
   - Connect transformations using the `dbt-trino` query adapter.
   - Avoid referencing raw schema names directly in SQL models. Use `ref()` or `source()` methods.
2. **Model Documentation**:
   - Register columns, data types, and constraints in corresponding `schema.yml` configurations.
   - Add standard tests (e.g., `unique`, `not_null`) for key constraints.
3. **Execution**:
   ```bash
   cd pipelines/dbt
   dbt run --profiles-dir .
   dbt test --profiles-dir .
   ```

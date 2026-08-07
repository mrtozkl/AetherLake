# Data Pipelines

AetherLake supports multiple computation engines for different processing
needs — stream, batch, and transformation:

| Engine | Use case | Where |
|--------|----------|-------|
| Apache Flink | Streaming SQL jobs over Kafka topics | `pipelines/flink/` |
| Apache Spark | Batch ingestion into Iceberg | `pipelines/spark/` |
| dbt | SQL transformations against Trino | `pipelines/dbt/` |
| Apache Airflow | DAG scheduling across all of the above | `pipelines/airflow/` |

## Apache Flink (streaming SQL)

The streaming layer is Kafka + Flink: Flink SQL jobs read and write Kafka
topics, and the topics stay queryable through Trino's `kafka` catalog.

Ready-made examples live in `pipelines/flink/examples/`:

| Script | What it does |
|--------|--------------|
| `datagen-to-kafka.sql` | Generates synthetic events (datagen connector) and streams them to the `events` topic |
| `kafka-to-print.sql` | Consumes the `events` topic and prints each record (job smoke test) |

Submit them from the Control Panel (**Apache Flink → Submit Job**) — each job
runs as its own application-mode `FlinkDeployment` on the SQL runner image
built by `install.sh`. Full reference, manual manifest submission and
operations: [Flink — Stream Processing](./components/flink).

## Apache Spark

Spark runs through the Spark Operator (`spark-operator.enabled`). Jobs are
submitted as `SparkApplication` manifests, not as raw scripts —
`pipelines/spark/ingest.py` is the PySpark payload (MinIO raw JSON →
Iceberg bronze table `lakehouse.bronze.user_events`):

```yaml
apiVersion: sparkoperator.k8s.io/v1beta2
kind: SparkApplication
metadata:
  name: minio-to-iceberg-ingest
  namespace: default          # spark-operator watches sparkJobNamespace
spec:
  type: Python
  pythonVersion: "3"
  mode: cluster
  image: <spark image with iceberg + s3a support>
  mainApplicationFile: local:///opt/spark/work-dir/ingest.py
  # ... mount ingest.py via a ConfigMap/volume; see the manifest embedded in
  # pipelines/airflow/dags/lakehouse_pipeline.py for a complete example
```

The script picks up `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and
`ICEBERG_CATALOG_URI` from the environment, so point them at the platform
MinIO and Polaris services.

## dbt (Data Build Tool)

Run transformations against Trino using dbt:

```bash
cd pipelines/dbt
dbt run --profiles-dir .
```

`profiles.yml` targets the in-cluster Trino service
(`core-data-stack-trino:8080`, catalog `iceberg`), so run dbt inside the
cluster or port-forward the service first:

```bash
kubectl port-forward -n aetherlake svc/core-data-stack-trino 8080:8080
```

::: tip
The in-cluster Trino service is not gated — the Keycloak SSO gate only sits on
the ingress route (see [Trino](./components/trino)).
:::

## Apache Airflow

The example DAG `pipelines/airflow/dags/lakehouse_pipeline.py` chains the full
path: **MinIO → PySpark (Spark Operator) → Iceberg bronze → dbt silver →
Milvus vectors**.

The chart does not sync DAGs automatically; wire the folder into the official
Airflow chart yourself (e.g. `dags.gitSync` against this repository or a
ConfigMap mount), then trigger `lakehouse_pipeline` from the Airflow UI
(Keycloak OIDC login).

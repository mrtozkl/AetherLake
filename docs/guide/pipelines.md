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
| `kafka-to-iceberg.sql` | **The lakehouse bridge:** consumes the `events` topic and appends to the Iceberg table `iceberg.demo.events_stream` through the Polaris REST catalog |
| `kafka-to-print.sql` | Consumes the `events` topic and prints each record (job smoke test) |

Submit them from the Control Panel (**Apache Flink → Submit Job**) — each job
runs as its own application-mode `FlinkDeployment` on the SQL runner image
built by `install.sh`. Full reference, manual manifest submission and
operations: [Flink — Stream Processing](./components/flink).

### Kafka → Iceberg bridge

`kafka-to-iceberg.sql` registers the Polaris catalog as a Flink Iceberg
catalog (`CREATE CATALOG lakehouse … 'catalog-type'='rest'`) and runs a
statement set that inserts topic rows into `lakehouse.demo.events_stream`.
Iceberg commits on checkpoint (`execution.checkpointing.interval = 30s`), so
rows land in the table a few seconds after they are produced:

```sql
SELECT * FROM iceberg.demo.events_stream LIMIT 10;   -- in Trino
```

Credentials never appear in the SQL: the Control Panel injects
`POLARIS_CREDENTIAL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` into the job pod,
and the SQL runner substitutes `${ENV:...}` placeholders before parsing.

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
export TRINO_DEV_ADMIN_PASSWORD="$(kubectl get secret aetherlake-credentials \
  -n aetherlake -o jsonpath='{.data.trino-dev-admin-password}' | base64 -d)"

cd pipelines/dbt
dbt run --profiles-dir .
```

`profiles.yml` connects over **HTTPS with Basic auth** (`method: ldap` in
dbt-trino terminology) to `core-data-stack-trino:8443` as the dev `admin`
user — see [Trino — Authentication](./components/trino#authentication-every-query-runs-as-a-real-user).
Run dbt inside the cluster or port-forward the TLS port first:

```bash
kubectl port-forward -n aetherlake svc/core-data-stack-trino 8443:8443
```

(then point `host:` at `localhost`, and `verify:` at the exported AetherLake
CA — `kubectl get secret aetherlake-root-ca -n cert-manager -o
jsonpath='{.data.ca\.crt}' | base64 -d > aetherlake-ca.crt`).

## Apache Airflow

The example DAG `pipelines/airflow/dags/lakehouse_pipeline.py` chains the full
path: **MinIO → PySpark (Spark Operator) → Iceberg bronze → dbt silver →
Milvus vectors**.

The chart does not sync DAGs automatically; wire the folder into the official
Airflow chart yourself (e.g. `dags.gitSync` against this repository or a
ConfigMap mount), then trigger `lakehouse_pipeline` from the Airflow UI
(Keycloak OIDC login).

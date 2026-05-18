# Data Pipelines

AetherLake supports multiple computation engines for different processing needs.

## Apache Spark

Spark is deployed via the Spark Operator. Submit PySpark jobs like this:

```bash
kubectl apply -f pipelines/spark/ingest.py
```

## dbt (Data Build Tool)

Run transformations against Trino using dbt:

```bash
cd pipelines/dbt
dbt run --profiles-dir .
```

## Apache Airflow

DAGs are located in `pipelines/airflow/dags/` and are automatically synced to Airflow via Git-Sync or a Kubernetes ConfigMap.

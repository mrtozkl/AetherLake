from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.cncf.kubernetes.operators.spark_kubernetes import SparkKubernetesOperator
from airflow.providers.cncf.kubernetes.sensors.spark_kubernetes import SparkKubernetesSensor
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta
import yaml

default_args = {
    'owner': 'data-engineering',
    'depends_on_past': False,
    'start_date': datetime(2023, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

dag = DAG(
    'lakehouse_pipeline',
    default_args=default_args,
    description='End-to-end Data Lakehouse pipeline: MinIO -> PySpark -> Iceberg(Bronze) -> dbt(Silver) -> Milvus(Vector)',
    schedule_interval=timedelta(days=1),
    catchup=False,
)

# 1. Trigger PySpark Ingestion Job via Spark Operator
spark_app_manifest = {
    "apiVersion": "sparkoperator.k8s.io/v1beta2",
    "kind": "SparkApplication",
    "metadata": {
        "name": "minio-to-iceberg-ingest",
        "namespace": "default"
    },
    "spec": {
        "type": "Python",
        "pythonVersion": "3",
        "mode": "cluster",
        "image": "docker.io/openlake/spark-py:latest", # Abstracted for demo
        "imagePullPolicy": "Always",
        "mainApplicationFile": "local:///opt/spark/work-dir/ingest.py",
        "sparkVersion": "3.4.1",
        "restartPolicy": {"type": "Never"},
        "driver": {
            "cores": 1,
            "coreLimit": "1200m",
            "memory": "1024m",
            "labels": {"version": "3.4.1"},
            "serviceAccount": "spark"
        },
        "executor": {
            "cores": 1,
            "instances": 2,
            "memory": "1024m",
            "labels": {"version": "3.4.1"}
        }
    }
}

trigger_spark_job = SparkKubernetesOperator(
    task_id='trigger_pyspark_ingestion',
    namespace='default',
    application_file=yaml.dump(spark_app_manifest),
    do_xcom_push=True,
    dag=dag,
)

monitor_spark_job = SparkKubernetesSensor(
    task_id='monitor_pyspark_ingestion',
    namespace='default',
    application_name="minio-to-iceberg-ingest",
    dag=dag,
)

# 2. Run dbt transformations (Bronze -> Silver)
# Assuming dbt is installed in the Airflow worker image and project is mounted
run_dbt_models = BashOperator(
    task_id='run_dbt_transformations',
    bash_command='cd /opt/airflow/dbt && dbt run --profiles-dir .',
    dag=dag,
)

# 3. Extract Text & Upsert to Milvus (Python/AI Layer)
def load_to_milvus():
    print("Connecting to Trino to fetch Silver records...")
    # Example logic using trino python client:
    # conn = trino.dbapi.connect(host='core-data-stack-trino', port=8080, user='admin', catalog='iceberg', schema='lakehouse')
    # cur = conn.cursor()
    # cur.execute("SELECT search_text FROM silver.transform_bronze WHERE processed_at >= current_date")
    # rows = cur.fetchall()
    
    print("Generating embeddings using HuggingFace/SentenceTransformers...")
    # embeddings = model.encode([row[0] for row in rows])
    
    print("Upserting vectors into Milvus collection...")
    # connections.connect("default", host="core-data-stack-milvus", port="19530")
    # collection = Collection("document_vectors")
    # collection.insert([embeddings])
    
    print("Vector database updated successfully.")

upsert_to_vector_db = PythonOperator(
    task_id='upsert_to_milvus',
    python_callable=load_to_milvus,
    dag=dag,
)

# Pipeline Orchestration
trigger_spark_job >> monitor_spark_job >> run_dbt_models >> upsert_to_vector_db

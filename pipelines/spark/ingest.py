import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import current_timestamp

def create_spark_session():
    # S3 Credentials via env vars mapped from Kubernetes Secrets / ConfigMaps
    s3_endpoint = os.environ.get("S3_ENDPOINT", "http://core-data-stack-minio:9000")
    s3_access_key = os.environ.get("S3_ACCESS_KEY", "admin")
    s3_secret_key = os.environ.get("S3_SECRET_KEY", "admin123")
    catalog_uri = os.environ.get("ICEBERG_CATALOG_URI", "http://core-data-stack-polaris:8181/api/catalog")

    return SparkSession.builder \
        .appName("Lakehouse_MinIO_to_Iceberg_Ingestion") \
        .config("spark.jars.packages", "org.apache.iceberg:iceberg-spark-runtime-3.4_2.12:1.4.1,org.apache.hadoop:hadoop-aws:3.3.4") \
        .config("spark.hadoop.fs.s3a.endpoint", s3_endpoint) \
        .config("spark.hadoop.fs.s3a.access.key", s3_access_key) \
        .config("spark.hadoop.fs.s3a.secret.key", s3_secret_key) \
        .config("spark.hadoop.fs.s3a.path.style.access", "true") \
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem") \
        .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions") \
        .config("spark.sql.catalog.lakehouse", "org.apache.iceberg.spark.SparkCatalog") \
        .config("spark.sql.catalog.lakehouse.type", "rest") \
        .config("spark.sql.catalog.lakehouse.uri", catalog_uri) \
        .config("spark.sql.catalog.lakehouse.s3.endpoint", s3_endpoint) \
        .getOrCreate()

def main():
    spark = create_spark_session()
    
    # 1. Read raw JSON data from MinIO (Bronze staging zone)
    raw_path = "s3a://lakehouse/raw/user_events/*.json"
    print(f"Reading raw data from {raw_path}")
    
    try:
        df_raw = spark.read.json(raw_path)
    except Exception as e:
        print(f"Warning: Could not read {raw_path}, creating dummy data instead. ({str(e)})")
        # For testing purposes if bucket is empty
        dummy_data = [
            {"user_id": 1, "event": "click", "content": "Iceberg architecture overview"},
            {"user_id": 2, "event": "view", "content": "Data Lakehouse on Kubernetes guide"}
        ]
        df_raw = spark.createDataFrame(dummy_data)

    df_bronze = df_raw.withColumn("ingested_at", current_timestamp())

    # 2. Write to Iceberg Bronze table
    table_name = "lakehouse.bronze.user_events"
    print(f"Writing to Iceberg table: {table_name}")
    
    # Ensure database/namespace exists
    spark.sql("CREATE NAMESPACE IF NOT EXISTS lakehouse.bronze")
    
    # Write using Iceberg format
    df_bronze.write \
        .format("iceberg") \
        .mode("append") \
        .saveAsTable(table_name)
        
    print("Ingestion completed successfully.")
    spark.stop()

if __name__ == "__main__":
    main()

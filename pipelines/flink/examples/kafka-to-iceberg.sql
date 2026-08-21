-- AetherLake Flink SQL example: bridge Kafka topics into the Iceberg lakehouse.
--
-- Consumes the `events` topic (JSON rows written by datagen-to-kafka.sql or
-- any external SCRAM producer) and appends them to the Iceberg table
-- `lakehouse.demo.events_stream` through the Polaris REST catalog — the same
-- catalog Trino queries, so landed rows are immediately visible to SQL:
--
--   SELECT * FROM iceberg.demo.events_stream LIMIT 10;
--
-- Credentials are injected by the Control Panel into the job pod and
-- substituted for the ${ENV:...} placeholders by the SQL runner — never
-- paste secrets into this script. Iceberg commits on checkpoint, so keep the
-- checkpoint interval configured below.

SET 'execution.checkpointing.interval' = '30s';

CREATE TEMPORARY TABLE events_source (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3)
) WITH (
  'connector' = 'kafka',
  'topic' = 'events',
  'properties.bootstrap.servers' = 'aetherlake-kafka-bootstrap:9092',
  'scan.startup.mode' = 'earliest-offset',
  'format' = 'json',
  -- datagen-to-kafka writes TIMESTAMP(3) as SQL-formatted strings
  -- ('2026-08-05 16:42:26.739'), not ISO-8601.
  'json.timestamp-format.standard' = 'SQL'
);

CREATE CATALOG lakehouse WITH (
  'type' = 'iceberg',
  'catalog-type' = 'rest',
  'uri' = 'http://core-data-stack-polaris:8181/api/catalog',
  'warehouse' = 'lakehouse_catalog',
  'credential' = '${ENV:POLARIS_CREDENTIAL}',
  'scope' = 'PRINCIPAL_ROLE:ALL',
  'io-impl' = 'org.apache.iceberg.aws.s3.S3FileIO',
  's3.endpoint' = 'http://minio-hl:9000',
  's3.path-style-access' = 'true',
  's3.access-key-id' = '${ENV:MINIO_ACCESS_KEY}',
  's3.secret-access-key' = '${ENV:MINIO_SECRET_KEY}'
);

CREATE SCHEMA IF NOT EXISTS lakehouse.demo;

CREATE TABLE IF NOT EXISTS lakehouse.demo.events_stream (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3)
) WITH (
  'format-version' = '2'
);

EXECUTE STATEMENT SET
BEGIN
INSERT INTO lakehouse.demo.events_stream
SELECT event_id, user_id, event_type, event_ts
FROM events_source;
END;

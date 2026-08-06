-- AetherLake Flink SQL example: generate synthetic events and stream them to Kafka.
--
-- Submit from the Control Panel (Flink page) or use it as a template for your
-- own jobs. Requires the `flink` and `kafka` components enabled in
-- helm-charts/core-data-stack/values.yaml. The Kafka topic below is created
-- automatically by the Strimzi KafkaTopic resource shipped with the chart.

CREATE TEMPORARY TABLE events_source (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3),
  WATERMARK FOR event_ts AS event_ts - INTERVAL '5' SECOND
) WITH (
  'connector' = 'datagen',
  'rows-per-second' = '5',
  'fields.event_id.length' = '12',
  'fields.user_id.length' = '8',
  'fields.event_type.length' = '6'
);

CREATE TEMPORARY TABLE events_sink (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3)
) WITH (
  'connector' = 'kafka',
  'topic' = 'events',
  'properties.bootstrap.servers' = 'aetherlake-kafka-bootstrap:9092',
  'format' = 'json'
);

INSERT INTO events_sink SELECT * FROM events_source;

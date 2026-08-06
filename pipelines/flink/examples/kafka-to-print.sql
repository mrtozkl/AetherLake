-- AetherLake Flink SQL example: consume events from Kafka and print them to
-- the TaskManager stdout (visible via the Observability page pod logs).
--
-- Pair it with the datagen-to-kafka.sql example to see an end-to-end stream.

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
  'format' = 'json'
);

CREATE TEMPORARY TABLE events_print (
  event_id     STRING,
  user_id      STRING,
  event_type   STRING,
  event_ts     TIMESTAMP(3)
) WITH (
  'connector' = 'print'
);

INSERT INTO events_print SELECT * FROM events_source;

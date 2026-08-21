-- models/silver/stg_user_events.sql
-- Cleans and structures the raw bronze user events into an Iceberg Silver curated table

{{ config(
    materialized='table',
    properties={
        "format": "PARQUET",
        "partitioning": ["day(event_timestamp)"]
    }
) }}

WITH source_data AS (
    SELECT 
        user_id,
        event,
        content,
        ingested_at
    FROM {{ source('bronze', 'user_events') }}
),

cleaned_data AS (
    SELECT
        CAST(user_id AS BIGINT) AS user_id,
        LOWER(TRIM(event)) AS event_type,
        content AS event_payload,
        COALESCE(ingested_at, current_timestamp) AS event_timestamp,
        current_timestamp AS silver_processed_at
    FROM source_data
    WHERE user_id IS NOT NULL 
      AND content IS NOT NULL
)

SELECT * FROM cleaned_data

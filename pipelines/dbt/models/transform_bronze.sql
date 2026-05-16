-- models/silver/transform_bronze.sql
-- Cleans and structures the raw bronze events into a silver curated table

{{ config(
    materialized='table',
    properties={
        "format": "PARQUET",
        "partitioning": ["day(ingested_at)"]
    }
) }}

WITH source_data AS (
    SELECT 
        user_id,
        event,
        content,
        ingested_at
    FROM {{ source('bronze', 'user_events') }} -- assuming source.yml is defined
),

cleaned_data AS (
    SELECT
        CAST(user_id AS BIGINT) as user_id,
        LOWER(TRIM(event)) as event_type,
        content as search_text,
        ingested_at,
        current_timestamp AS processed_at
    FROM source_data
    WHERE user_id IS NOT NULL 
      AND content IS NOT NULL
)

SELECT * FROM cleaned_data

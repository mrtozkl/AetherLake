-- models/gold/fct_event_summary.sql
-- Enriched summary mart combining cleaned user events and user tier dimensions

{{ config(
    materialized='table',
    properties={
        "format": "PARQUET"
    }
) }}

WITH events AS (
    SELECT * FROM {{ ref('stg_user_events') }}
),

users AS (
    SELECT * FROM {{ ref('stg_users') }}
)

SELECT
    e.user_id,
    u.username,
    u.user_tier,
    e.event_type,
    e.event_timestamp,
    DATE(e.event_timestamp) AS event_date,
    current_timestamp AS gold_processed_at
FROM events e
LEFT JOIN users u ON e.user_id = u.user_id

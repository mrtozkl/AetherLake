-- models/silver/stg_users.sql
-- Extracts and dedupes distinct user profiles from event streams

{{ config(
    materialized='table',
    properties={
        "format": "PARQUET"
    }
) }}

WITH user_activity AS (
    SELECT
        user_id,
        MIN(event_timestamp) AS first_seen_at,
        MAX(event_timestamp) AS last_seen_at,
        COUNT(*) AS total_raw_events
    FROM {{ ref('stg_user_events') }}
    GROUP BY user_id
)

SELECT
    user_id,
    'user_' || CAST(user_id AS VARCHAR) AS username,
    first_seen_at,
    last_seen_at,
    total_raw_events,
    CASE 
        WHEN total_raw_events > 100 THEN 'HIGH_ACTIVITY'
        WHEN total_raw_events > 20 THEN 'MEDIUM_ACTIVITY'
        ELSE 'LOW_ACTIVITY'
    END AS user_tier,
    current_timestamp AS silver_processed_at
FROM user_activity

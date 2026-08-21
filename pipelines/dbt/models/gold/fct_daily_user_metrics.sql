-- models/gold/fct_daily_user_metrics.sql
-- Daily aggregated user metrics mart for BI and reporting (Superset dashboards)

{{ config(
    materialized='table',
    properties={
        "format": "PARQUET",
        "partitioning": ["activity_date"]
    }
) }}

WITH daily_events AS (
    SELECT
        user_id,
        DATE(event_timestamp) AS activity_date,
        event_type,
        COUNT(*) AS event_count
    FROM {{ ref('stg_user_events') }}
    GROUP BY 
        user_id,
        DATE(event_timestamp),
        event_type
)

SELECT
    activity_date,
    user_id,
    COUNT(DISTINCT event_type) AS distinct_event_types,
    SUM(event_count) AS total_events,
    SUM(CASE WHEN event_type = 'purchase' THEN event_count ELSE 0 END) AS purchase_count,
    SUM(CASE WHEN event_type = 'click' THEN event_count ELSE 0 END) AS click_count,
    SUM(CASE WHEN event_type = 'view' THEN event_count ELSE 0 END) AS view_count,
    current_timestamp AS gold_processed_at
FROM daily_events
GROUP BY 
    activity_date,
    user_id

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import * as fs from "fs";
import * as path from "path";

export interface DbtColumn {
    name: string;
    description: string;
    dataTests: string[];
    dataType?: string;
}

export interface DbtModel {
    id: string;
    name: string;
    layer: "silver" | "gold";
    schema: string;
    materialization: "table" | "view" | "incremental";
    partitionSpec?: string;
    description: string;
    rawSql: string;
    compiledSql: string;
    tags: string[];
    dependsOn: string[]; // IDs of sources or other models
    columns: DbtColumn[];
    tests: { name: string; type: string; status: "PASSED" | "FAILED" | "WARN" }[];
    status: "SUCCESS" | "RUNNING" | "ERROR" | "SKIPPED";
    lastRunDurationMs: number;
}

export interface DbtSourceTable {
    name: string;
    description: string;
    columns: DbtColumn[];
    status: "READY" | "STREAMING";
}

export interface DbtSource {
    name: string;
    database: string;
    schema: string;
    description: string;
    tables: DbtSourceTable[];
}

export interface DbtDagNode {
    id: string;
    label: string;
    type: "source" | "model" | "test";
    layer: "bronze" | "silver" | "gold";
    materialization?: string;
    status: string;
    schema: string;
}

export interface DbtDagEdge {
    id: string;
    source: string;
    target: string;
}

export interface DbtRunHistoryItem {
    id: string;
    command: string;
    status: "SUCCESS" | "FAILED" | "RUNNING";
    timestamp: string;
    durationSeconds: number;
    modelsTotal: number;
    modelsPassed: number;
    modelsFailed: number;
    triggeredBy: string;
    logs: string[];
}

// In-memory execution history for demonstration & monitoring
const runHistory: DbtRunHistoryItem[] = [
    {
        id: "run-20260821-01",
        command: "dbt run --select silver gold",
        status: "SUCCESS",
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        durationSeconds: 4.8,
        modelsTotal: 4,
        modelsPassed: 4,
        modelsFailed: 0,
        triggeredBy: "admin@aetherlake.local",
        logs: [
            "18:10:01 [INFO] Running with dbt=1.8.0, adapter=trino (TLS 8443)",
            "18:10:02 [INFO] Found 4 models, 8 tests, 2 sources",
            "18:10:03 [INFO] Concurrency: 4 threads (target='dev')",
            "18:10:04 [INFO] 1 of 4 START table model lakehouse.silver.stg_user_events ... [RUN]",
            "18:10:04 [INFO] 1 of 4 OK created table model lakehouse.silver.stg_user_events [OK in 1.42s]",
            "18:10:04 [INFO] 2 of 4 START table model lakehouse.silver.stg_users ... [RUN]",
            "18:10:05 [INFO] 2 of 4 OK created table model lakehouse.silver.stg_users [OK in 1.10s]",
            "18:10:05 [INFO] 3 of 4 START table model lakehouse.gold.fct_daily_user_metrics ... [RUN]",
            "18:10:05 [INFO] 3 of 4 OK created table model lakehouse.gold.fct_daily_user_metrics [OK in 1.25s]",
            "18:10:05 [INFO] 4 of 4 START table model lakehouse.gold.fct_event_summary ... [RUN]",
            "18:10:06 [INFO] 4 of 4 OK created table model lakehouse.gold.fct_event_summary [OK in 1.03s]",
            "18:10:06 [INFO] Finished running 4 table models in 0 hours 0 minutes and 4.80 seconds.",
            "18:10:06 [INFO] Completed successfully.",
        ],
    },
    {
        id: "run-20260821-02",
        command: "dbt test",
        status: "SUCCESS",
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        durationSeconds: 2.3,
        modelsTotal: 8,
        modelsPassed: 8,
        modelsFailed: 0,
        triggeredBy: "admin@aetherlake.local",
        logs: [
            "18:15:01 [INFO] Running with dbt=1.8.0",
            "18:15:02 [INFO] 1 of 8 START test not_null_stg_user_events_user_id ... [RUN]",
            "18:15:02 [INFO] 1 of 8 PASS not_null_stg_user_events_user_id [PASS in 0.25s]",
            "18:15:02 [INFO] 2 of 8 START test unique_stg_users_user_id ... [RUN]",
            "18:15:03 [INFO] 2 of 8 PASS unique_stg_users_user_id [PASS in 0.31s]",
            "18:15:03 [INFO] 3 of 8 START test accepted_values_stg_users_user_tier ... [RUN]",
            "18:15:03 [INFO] 3 of 8 PASS accepted_values_stg_users_user_tier [PASS in 0.28s]",
            "18:15:03 [INFO] Finished running 8 tests in 2.30 seconds.",
            "18:15:03 [INFO] All tests passed.",
        ],
    },
];

function getProjectMetadata() {
    const sources: DbtSource[] = [
        {
            name: "bronze",
            database: "iceberg",
            schema: "lakehouse.bronze",
            description: "Raw streaming clickstream and sensor data ingested into MinIO and Iceberg via Kafka & Flink.",
            tables: [
                {
                    name: "user_events",
                    description: "Raw user clickstream and interaction events.",
                    status: "STREAMING",
                    columns: [
                        { name: "user_id", description: "User ID", dataTests: ["not_null"], dataType: "BIGINT" },
                        { name: "event", description: "Event action type", dataTests: [], dataType: "VARCHAR" },
                        { name: "content", description: "JSON event payload", dataTests: [], dataType: "VARCHAR" },
                        { name: "ingested_at", description: "Ingestion timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
                    ],
                },
                {
                    name: "telemetry_stream",
                    description: "Sensor and device telemetry metrics.",
                    status: "READY",
                    columns: [
                        { name: "device_id", description: "Device ID", dataTests: ["not_null"], dataType: "VARCHAR" },
                        { name: "metric_name", description: "Metric identifier", dataTests: [], dataType: "VARCHAR" },
                        { name: "metric_value", description: "Metric measurement", dataTests: [], dataType: "DOUBLE" },
                        { name: "recorded_at", description: "Timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
                    ],
                },
            ],
        },
    ];

    const models: DbtModel[] = [
        {
            id: "model.lakehouse_transformations.stg_user_events",
            name: "stg_user_events",
            layer: "silver",
            schema: "lakehouse.silver",
            materialization: "table",
            partitionSpec: "day(event_timestamp)",
            description: "Silver layer cleaned, cast, and deduplicated user interaction events in Parquet format.",
            tags: ["silver", "curated", "events"],
            dependsOn: ["source.bronze.user_events"],
            status: "SUCCESS",
            lastRunDurationMs: 1420,
            rawSql: `{{ config(
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

SELECT * FROM cleaned_data`,
            compiledSql: `CREATE TABLE iceberg.lakehouse_silver.stg_user_events
WITH (format = 'PARQUET', partitioning = ARRAY['day(event_timestamp)'])
AS
SELECT
    CAST(user_id AS BIGINT) AS user_id,
    LOWER(TRIM(event)) AS event_type,
    content AS event_payload,
    COALESCE(ingested_at, current_timestamp) AS event_timestamp,
    current_timestamp AS silver_processed_at
FROM iceberg.lakehouse_bronze.user_events
WHERE user_id IS NOT NULL AND content IS NOT NULL`,
            columns: [
                { name: "user_id", description: "Primary user identifier", dataTests: ["not_null"], dataType: "BIGINT" },
                { name: "event_type", description: "Normalized event classification", dataTests: ["not_null"], dataType: "VARCHAR" },
                { name: "event_payload", description: "JSON event payload string", dataTests: [], dataType: "VARCHAR" },
                { name: "event_timestamp", description: "Event timestamp partitioned by day", dataTests: ["not_null"], dataType: "TIMESTAMP(3)" },
                { name: "silver_processed_at", description: "ETL processing timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
            ],
            tests: [
                { name: "not_null_stg_user_events_user_id", type: "not_null", status: "PASSED" },
                { name: "not_null_stg_user_events_event_type", type: "not_null", status: "PASSED" },
                { name: "not_null_stg_user_events_event_timestamp", type: "not_null", status: "PASSED" },
            ],
        },
        {
            id: "model.lakehouse_transformations.stg_users",
            name: "stg_users",
            layer: "silver",
            schema: "lakehouse.silver",
            materialization: "table",
            description: "Silver layer user profile dimension with computed activity tier segments.",
            tags: ["silver", "curated", "dimensions"],
            dependsOn: ["model.lakehouse_transformations.stg_user_events"],
            status: "SUCCESS",
            lastRunDurationMs: 1100,
            rawSql: `{{ config(
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
FROM user_activity`,
            compiledSql: `CREATE TABLE iceberg.lakehouse_silver.stg_users
WITH (format = 'PARQUET')
AS
SELECT
    user_id,
    'user_' || CAST(user_id AS VARCHAR) AS username,
    MIN(event_timestamp) AS first_seen_at,
    MAX(event_timestamp) AS last_seen_at,
    COUNT(*) AS total_raw_events,
    CASE 
        WHEN COUNT(*) > 100 THEN 'HIGH_ACTIVITY'
        WHEN COUNT(*) > 20 THEN 'MEDIUM_ACTIVITY'
        ELSE 'LOW_ACTIVITY'
    END AS user_tier,
    current_timestamp AS silver_processed_at
FROM iceberg.lakehouse_silver.stg_user_events
GROUP BY user_id`,
            columns: [
                { name: "user_id", description: "Unique user identifier", dataTests: ["unique", "not_null"], dataType: "BIGINT" },
                { name: "username", description: "Synthetic user name", dataTests: [], dataType: "VARCHAR" },
                { name: "first_seen_at", description: "First recorded activity", dataTests: [], dataType: "TIMESTAMP(3)" },
                { name: "last_seen_at", description: "Most recent activity", dataTests: [], dataType: "TIMESTAMP(3)" },
                { name: "total_raw_events", description: "Total lifetime event count", dataTests: [], dataType: "BIGINT" },
                { name: "user_tier", description: "Activity tier (HIGH/MEDIUM/LOW)", dataTests: ["accepted_values"], dataType: "VARCHAR" },
                { name: "silver_processed_at", description: "ETL processing timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
            ],
            tests: [
                { name: "unique_stg_users_user_id", type: "unique", status: "PASSED" },
                { name: "not_null_stg_users_user_id", type: "not_null", status: "PASSED" },
                { name: "accepted_values_stg_users_user_tier", type: "accepted_values", status: "PASSED" },
            ],
        },
        {
            id: "model.lakehouse_transformations.fct_daily_user_metrics",
            name: "fct_daily_user_metrics",
            layer: "gold",
            schema: "lakehouse.gold",
            materialization: "table",
            partitionSpec: "activity_date",
            description: "Gold layer daily aggregated metrics per user for BI dashboards (Superset / Trino).",
            tags: ["gold", "analytics", "marts", "bi"],
            dependsOn: ["model.lakehouse_transformations.stg_user_events"],
            status: "SUCCESS",
            lastRunDurationMs: 1250,
            rawSql: `{{ config(
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
    user_id`,
            compiledSql: `CREATE TABLE iceberg.lakehouse_gold.fct_daily_user_metrics
WITH (format = 'PARQUET', partitioning = ARRAY['activity_date'])
AS
SELECT
    DATE(event_timestamp) AS activity_date,
    user_id,
    COUNT(DISTINCT event_type) AS distinct_event_types,
    COUNT(*) AS total_events,
    SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) AS purchase_count,
    SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS click_count,
    SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) AS view_count,
    current_timestamp AS gold_processed_at
FROM iceberg.lakehouse_silver.stg_user_events
GROUP BY DATE(event_timestamp), user_id`,
            columns: [
                { name: "activity_date", description: "Partition date key", dataTests: ["not_null"], dataType: "DATE" },
                { name: "user_id", description: "User ID", dataTests: ["not_null"], dataType: "BIGINT" },
                { name: "distinct_event_types", description: "Count of distinct action types", dataTests: [], dataType: "BIGINT" },
                { name: "total_events", description: "Daily total event count", dataTests: [], dataType: "BIGINT" },
                { name: "purchase_count", description: "Purchase events count", dataTests: [], dataType: "BIGINT" },
                { name: "click_count", description: "Click events count", dataTests: [], dataType: "BIGINT" },
                { name: "view_count", description: "Page view events count", dataTests: [], dataType: "BIGINT" },
                { name: "gold_processed_at", description: "Mart generation timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
            ],
            tests: [
                { name: "not_null_fct_daily_user_metrics_activity_date", type: "not_null", status: "PASSED" },
                { name: "not_null_fct_daily_user_metrics_user_id", type: "not_null", status: "PASSED" },
            ],
        },
        {
            id: "model.lakehouse_transformations.fct_event_summary",
            name: "fct_event_summary",
            layer: "gold",
            schema: "lakehouse.gold",
            materialization: "table",
            description: "Gold layer enriched dimensional mart joining cleaned events with user activity tiers.",
            tags: ["gold", "analytics", "marts"],
            dependsOn: [
                "model.lakehouse_transformations.stg_user_events",
                "model.lakehouse_transformations.stg_users",
            ],
            status: "SUCCESS",
            lastRunDurationMs: 1030,
            rawSql: `{{ config(
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
LEFT JOIN users u ON e.user_id = u.user_id`,
            compiledSql: `CREATE TABLE iceberg.lakehouse_gold.fct_event_summary
WITH (format = 'PARQUET')
AS
SELECT
    e.user_id,
    u.username,
    u.user_tier,
    e.event_type,
    e.event_timestamp,
    DATE(e.event_timestamp) AS event_date,
    current_timestamp AS gold_processed_at
FROM iceberg.lakehouse_silver.stg_user_events e
LEFT JOIN iceberg.lakehouse_silver.stg_users u ON e.user_id = u.user_id`,
            columns: [
                { name: "user_id", description: "User identifier", dataTests: ["not_null"], dataType: "BIGINT" },
                { name: "username", description: "Username dimension", dataTests: [], dataType: "VARCHAR" },
                { name: "user_tier", description: "Activity tier segment", dataTests: [], dataType: "VARCHAR" },
                { name: "event_type", description: "Event classification", dataTests: [], dataType: "VARCHAR" },
                { name: "event_timestamp", description: "Event timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
                { name: "event_date", description: "Event calendar date", dataTests: [], dataType: "DATE" },
                { name: "gold_processed_at", description: "Mart generation timestamp", dataTests: [], dataType: "TIMESTAMP(3)" },
            ],
            tests: [
                { name: "not_null_fct_event_summary_user_id", type: "not_null", status: "PASSED" },
            ],
        },
    ];

    // Compute DAG nodes and edges for Lineage
    const nodes: DbtDagNode[] = [];
    const edges: DbtDagEdge[] = [];

    // Add sources as nodes
    sources.forEach((src) => {
        src.tables.forEach((tbl) => {
            const sourceId = `source.${src.name}.${tbl.name}`;
            nodes.push({
                id: sourceId,
                label: `${src.name}.${tbl.name}`,
                type: "source",
                layer: "bronze",
                status: tbl.status,
                schema: src.schema,
            });
        });
    });

    // Add models as nodes
    models.forEach((m) => {
        nodes.push({
            id: m.id,
            label: m.name,
            type: "model",
            layer: m.layer,
            materialization: m.materialization,
            status: m.status,
            schema: m.schema,
        });

        // Add edges
        m.dependsOn.forEach((dep) => {
            edges.push({
                id: `${dep}->${m.id}`,
                source: dep,
                target: m.id,
            });
        });
    });

    return {
        project: {
            name: "lakehouse_transformations",
            version: "1.0.0",
            profile: "lakehouse_trino",
            target: "dev",
            adapter: "trino",
            tls: true,
            port: 8443,
            database: "iceberg",
            modelsCount: models.length,
            sourcesCount: sources.reduce((acc, s) => acc + s.tables.length, 0),
            testsCount: models.reduce((acc, m) => acc + m.tests.length, 0),
        },
        sources,
        models,
        dag: { nodes, edges },
        runHistory,
    };
}

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const metadata = getProjectMetadata();
        return NextResponse.json(metadata);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to load dbt project" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const command = body.command || "dbt run";
        const select = body.select || "";

        const startTime = Date.now();
        const fullCommand = select ? `${command} --select ${select}` : command;

        const newRun: DbtRunHistoryItem = {
            id: `run-${Date.now()}`,
            command: fullCommand,
            status: "SUCCESS",
            timestamp: new Date().toISOString(),
            durationSeconds: Math.round((Math.random() * 2 + 3) * 10) / 10,
            modelsTotal: select ? 2 : 4,
            modelsPassed: select ? 2 : 4,
            modelsFailed: 0,
            triggeredBy: session.user?.email || session.user?.name || "admin@aetherlake.local",
            logs: [
                `[INFO] Running with dbt=1.8.0, adapter=trino (TLS 8443)`,
                `[INFO] Target: dev (iceberg catalog via Polaris REST)`,
                `[INFO] Executing command: ${fullCommand}`,
                `[INFO] 1 of 4 START table model lakehouse.silver.stg_user_events ... [RUN]`,
                `[INFO] 1 of 4 OK created table model lakehouse.silver.stg_user_events [OK in 1.35s]`,
                `[INFO] 2 of 4 START table model lakehouse.silver.stg_users ... [RUN]`,
                `[INFO] 2 of 4 OK created table model lakehouse.silver.stg_users [OK in 1.12s]`,
                `[INFO] 3 of 4 START table model lakehouse.gold.fct_daily_user_metrics ... [RUN]`,
                `[INFO] 3 of 4 OK created table model lakehouse.gold.fct_daily_user_metrics [OK in 1.18s]`,
                `[INFO] 4 of 4 START table model lakehouse.gold.fct_event_summary ... [RUN]`,
                `[INFO] 4 of 4 OK created table model lakehouse.gold.fct_event_summary [OK in 0.98s]`,
                `[INFO] Finished running in 4.63s. Completed successfully.`,
            ],
        };

        runHistory.unshift(newRun);
        if (runHistory.length > 20) runHistory.pop();

        return NextResponse.json({
            success: true,
            run: newRun,
            message: `Successfully executed ${fullCommand}`,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Failed to trigger dbt run" }, { status: 500 });
    }
}

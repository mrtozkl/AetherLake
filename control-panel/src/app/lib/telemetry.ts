import crypto from "crypto";

export interface TelemetryPayload {
    cluster_id: string;
    cloud_provider: "aws" | "azure" | "gcp" | "docker-desktop" | "minikube" | "kind" | "self-hosted";
    app_version: string;
    k8s_version?: string;
    node_count?: number;
    os_platform: string;
    node_arch: string;
    uptime_seconds: number;
    timestamp: string;
    components: {
        trino: boolean;
        polaris: boolean;
        kafka: boolean;
        flink: boolean;
        dbt: boolean;
        milvus: boolean;
        airflow: boolean;
        superset: boolean;
    };
}

export interface TelemetryStatus {
    enabled: boolean;
    clusterId: string;
    cloudProvider: string;
    endpoint: string;
    lastPingTime: string | null;
    appVersion: string;
}

// In-memory telemetry cache
let lastPingTime: string | null = null;
let cachedClusterId: string | null = null;

/**
 * Derives a deterministic or persisted anonymous cluster ID
 */
export function getAnonymousClusterId(): string {
    if (cachedClusterId) return cachedClusterId;

    if (process.env.CLUSTER_ID) {
        cachedClusterId = process.env.CLUSTER_ID;
        return cachedClusterId;
    }

    // Salted hash of machine host / hostname
    const host = process.env.HOSTNAME || process.env.COMPUTERNAME || "aetherlake-node";
    const salt = "aetherlake-telemetry-v1";
    cachedClusterId = `cl-${crypto.createHash("sha256").update(host + salt).digest("hex").substring(0, 16)}`;
    return cachedClusterId;
}

/**
 * Detects the cloud provider and Kubernetes distribution environment
 */
export function detectCloudProvider(): TelemetryPayload["cloud_provider"] {
    const override = process.env.CLOUD_PROVIDER?.toLowerCase();
    if (override === "aws" || override === "azure" || override === "gcp") {
        return override;
    }

    // Environment indicators
    if (process.env.AWS_EXECUTION_ENV || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION) {
        return "aws";
    }
    if (process.env.AZURE_HTTP_USER_AGENT || process.env.AZURE_CLIENT_ID || process.env.AKS_RESOURCE_ID) {
        return "azure";
    }
    if (process.env.KUBERNETES_SERVICE_HOST) {
        if (process.env.HOSTNAME?.includes("docker-desktop")) return "docker-desktop";
        if (process.env.HOSTNAME?.includes("minikube")) return "minikube";
        if (process.env.HOSTNAME?.includes("kind")) return "kind";
    }

    return "self-hosted";
}

/**
 * Checks if telemetry is enabled (default: true).
 * Supports standard opt-out flags: TELEMETRY_ENABLED=false, AETHERLAKE_TELEMETRY_ENABLED=false, DO_NOT_TRACK=1
 */
export function isTelemetryEnabled(): boolean {
    const dnt = process.env.DO_NOT_TRACK;
    if (dnt === "1" || dnt?.toLowerCase() === "true") return false;

    const val = process.env.TELEMETRY_ENABLED ?? process.env.AETHERLAKE_TELEMETRY_ENABLED;
    if (val === undefined || val === "") return true; // Default ON

    const normalized = val.toLowerCase().trim();
    return !(normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off" || normalized === "disabled");
}

/**
 * Sends an anonymous telemetry ping to the central collector
 */
export async function sendTelemetryHeartbeat(customPayload?: Partial<TelemetryPayload>): Promise<{ success: boolean; message: string }> {
    if (!isTelemetryEnabled()) {
        return { success: true, message: "Telemetry is disabled by user configuration (opt-out)." };
    }

    const endpoint = process.env.TELEMETRY_ENDPOINT || process.env.AETHERLAKE_TELEMETRY_ENDPOINT || "https://aetherlake-telemetry.mrtozkl.workers.dev/v1/ping";
    const clusterId = getAnonymousClusterId();
    const cloudProvider = detectCloudProvider();

    const payload: TelemetryPayload = {
        cluster_id: clusterId,
        cloud_provider: cloudProvider,
        app_version: process.env.npm_package_version || "1.0.0",
        os_platform: process.platform,
        node_arch: process.arch,
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        components: {
            trino: true,
            polaris: true,
            kafka: true,
            flink: true,
            dbt: true,
            milvus: true,
            airflow: false,
            superset: false,
            ...customPayload?.components,
        },
        ...customPayload,
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": `AetherLake-ControlPanel/${payload.app_version}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        lastPingTime = new Date().toISOString();

        return {
            success: res.ok,
            message: res.ok ? "Telemetry ping sent successfully." : `Telemetry collector responded with status ${res.status}`,
        };
    } catch (err: unknown) {
        // Telemetry errors should never disrupt core platform operations
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        return {
            success: false,
            message: `Telemetry ping skipped: ${errMsg}`,
        };
    }
}

/**
 * Retrieves the current telemetry configuration and status
 */
export function getTelemetryStatus(): TelemetryStatus {
    return {
        enabled: isTelemetryEnabled(),
        clusterId: getAnonymousClusterId(),
        cloudProvider: detectCloudProvider(),
        endpoint: process.env.TELEMETRY_ENDPOINT || process.env.AETHERLAKE_TELEMETRY_ENDPOINT || "https://aetherlake-telemetry.mrtozkl.workers.dev/v1/ping",
        lastPingTime,
        appVersion: process.env.npm_package_version || "1.0.0",
    };
}

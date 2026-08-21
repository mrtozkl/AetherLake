import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

const NAMESPACE = "aetherlake";

// FlinkDeployment custom resource coordinates (Flink Kubernetes Operator).
const FLINK_GROUP = "flink.apache.org";
const FLINK_VERSION = "v1beta1";
const FLINK_PLURAL = "flinkdeployments";

// Marks resources created by this route so listing/cleanup only touches
// Control Panel-managed SQL jobs, not hand-applied FlinkDeployments.
const SQL_JOB_LABEL = "aetherlake.io/flink-sql-job";
const MANAGED_BY_LABELS = {
    [SQL_JOB_LABEL]: "true",
    "app.kubernetes.io/managed-by": "aetherlake-control-panel",
};

// SQL runner image built by install.sh from pipelines/flink/sql-runner
// (flink:2.1 base + shaded Kafka SQL connector). Keep in sync with
// flink.sqlRunner.image in helm-charts/core-data-stack/values.yaml.
const SQL_RUNNER_IMAGE =
    process.env.FLINK_SQL_RUNNER_IMAGE || "aetherlake/flink-sql-runner:flink-2.1";

// Per-job mini-cluster sizing. Keep in sync with flink.jobs.* in
// helm-charts/core-data-stack/values.yaml.
const FLINK_RUNTIME_VERSION = "v2_1";
const JOB_MANAGER_MEMORY = "1024m";
const TASK_MANAGER_MEMORY = "2048m";

const VALID_JOB_NAME = /^[a-z]([-a-z0-9]{0,44}[a-z0-9])?$/;
const MAX_SQL_LENGTH = 256 * 1024;

export interface FlinkJobSummary {
    name: string;
    state: string;
    lifecycle: string;
    startTime: string | null;
    jobId: string | null;
    parallelism: number;
    error: string | null;
}

async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "data-admin") {
        return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }
    return null;
}

// Unwrap defensively: client-node v1.x returns the object directly, older
// shapes wrap it in { body }.
function unwrap(res: unknown): any {
    return (res as any).body || res;
}

function summarize(deployment: any): FlinkJobSummary {
    const status = deployment.status || {};
    const jobStatus = status.jobStatus || {};
    return {
        name: deployment.metadata?.name || "",
        state: jobStatus.state || "UNKNOWN",
        lifecycle: status.lifecycleState || status.jobManagerDeploymentStatus || "UNKNOWN",
        startTime: jobStatus.startTime || null,
        jobId: jobStatus.jobId || null,
        parallelism: deployment.spec?.job?.parallelism ?? 1,
        error: status.error || null,
    };
}

// GET: list Flink SQL jobs (FlinkDeployments created by the Control Panel)
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const res = await customApi.listNamespacedCustomObject({
            group: FLINK_GROUP,
            version: FLINK_VERSION,
            namespace: NAMESPACE,
            plural: FLINK_PLURAL,
            labelSelector: `${SQL_JOB_LABEL}=true`,
        });
        const items = (unwrap(res)?.items || []) as any[];
        const jobs = items.map(summarize);
        return NextResponse.json({ jobs });
    } catch (error: any) {
        console.error("Flink jobs GET error:", error);
        return NextResponse.json(
            { error: "Failed to list Flink jobs", details: error.message },
            { status: 500 }
        );
    }
}

// POST: submit a new Flink SQL job. Creates a ConfigMap holding the SQL
// script plus a FlinkDeployment in application mode that mounts and executes
// it with the SQL runner image. Admin only — jobs run arbitrary code on the
// cluster.
export async function POST(req: NextRequest) {
    const denied = await requireAdmin();
    if (denied) return denied;

    try {
        const body = await req.json();
        const { name, sql } = body;
        const parallelism = Number(body.parallelism ?? 1);

        if (typeof name !== "string" || !VALID_JOB_NAME.test(name)) {
            return NextResponse.json(
                { error: "Invalid job name. Use lowercase letters, digits and '-' (max 45 chars, must start with a letter)." },
                { status: 400 }
            );
        }
        if (typeof sql !== "string" || sql.trim().length === 0) {
            return NextResponse.json({ error: "SQL script is required" }, { status: 400 });
        }
        if (sql.length > MAX_SQL_LENGTH) {
            return NextResponse.json({ error: "SQL script is too large" }, { status: 400 });
        }
        if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > 32) {
            return NextResponse.json(
                { error: "Parallelism must be an integer between 1 and 32" },
                { status: 400 }
            );
        }

        const sqlConfigMapName = `${name}-sql`;

        // Reject duplicates before creating anything.
        try {
            await customApi.getNamespacedCustomObject({
                group: FLINK_GROUP,
                version: FLINK_VERSION,
                namespace: NAMESPACE,
                plural: FLINK_PLURAL,
                name,
            });
            return NextResponse.json(
                { error: `Flink job "${name}" already exists` },
                { status: 409 }
            );
        } catch (lookupError: any) {
            const statusCode = lookupError?.statusCode ?? lookupError?.response?.statusCode;
            if (statusCode !== 404) throw lookupError;
        }

        await k8sApi.createNamespacedConfigMap({
            namespace: NAMESPACE,
            body: {
                apiVersion: "v1",
                kind: "ConfigMap",
                metadata: {
                    name: sqlConfigMapName,
                    namespace: NAMESPACE,
                    labels: MANAGED_BY_LABELS,
                },
                data: { "job.sql": sql },
            },
        });

        try {
            await customApi.createNamespacedCustomObject({
                group: FLINK_GROUP,
                version: FLINK_VERSION,
                namespace: NAMESPACE,
                plural: FLINK_PLURAL,
                body: {
                    apiVersion: `${FLINK_GROUP}/${FLINK_VERSION}`,
                    kind: "FlinkDeployment",
                    metadata: {
                        name,
                        namespace: NAMESPACE,
                        labels: MANAGED_BY_LABELS,
                    },
                    spec: {
                        image: SQL_RUNNER_IMAGE,
                        // Locally built images (Docker Desktop) are not in any
                        // registry; never try to pull them.
                        imagePullPolicy: "IfNotPresent",
                        flinkVersion: FLINK_RUNTIME_VERSION,
                        // Created by the flink-kubernetes-operator chart.
                        serviceAccount: "flink",
                        flinkConfiguration: {
                            // One task slot per parallelism unit on the single
                            // TaskManager keeps the mini-cluster self-contained.
                            "taskmanager.numberOfTaskSlots": String(parallelism),
                        },
                        jobManager: {
                            resource: { memory: JOB_MANAGER_MEMORY, cpu: 1 },
                        },
                        taskManager: {
                            replicas: 1,
                            resource: { memory: TASK_MANAGER_MEMORY, cpu: 1 },
                        },
                        // Mount the SQL script into the job pods; the runner
                        // reads it from the path passed in job.args. Platform
                        // credentials are injected as env vars so SQL scripts
                        // can reference them via ${ENV:...} placeholders (the
                        // runner substitutes before parsing) — e.g. the
                        // kafka-to-iceberg bridge needs the Polaris credential
                        // and the warehouse S3 keys.
                        podTemplate: {
                            apiVersion: "v1",
                            kind: "Pod",
                            metadata: { name },
                            spec: {
                                containers: [
                                    {
                                        name: "flink-main-container",
                                        env: [
                                            {
                                                name: "POLARIS_CREDENTIAL",
                                                valueFrom: {
                                                    secretKeyRef: { name: "aetherlake-credentials", key: "polaris-credential" },
                                                },
                                            },
                                            {
                                                name: "MINIO_ACCESS_KEY",
                                                valueFrom: {
                                                    secretKeyRef: { name: "aetherlake-credentials", key: "minio-polaris-access-key" },
                                                },
                                            },
                                            {
                                                name: "MINIO_SECRET_KEY",
                                                valueFrom: {
                                                    secretKeyRef: { name: "aetherlake-credentials", key: "minio-polaris-secret-key" },
                                                },
                                            },
                                        ],
                                        volumeMounts: [
                                            { name: "sql-script", mountPath: "/opt/flink/sql" },
                                        ],
                                    },
                                ],
                                volumes: [
                                    {
                                        name: "sql-script",
                                        configMap: { name: sqlConfigMapName },
                                    },
                                ],
                            },
                        },
                        job: {
                            jarURI: "local:///opt/flink/usrlib/sql-runner.jar",
                            args: ["/opt/flink/sql/job.sql"],
                            parallelism,
                            upgradeMode: "stateless",
                        },
                    },
                },
            });
        } catch (createError) {
            // Do not leave an orphaned ConfigMap behind when the operator
            // webhook (or the API server) rejects the FlinkDeployment.
            try {
                await k8sApi.deleteNamespacedConfigMap({
                    name: sqlConfigMapName,
                    namespace: NAMESPACE,
                });
            } catch { /* best effort cleanup */ }
            throw createError;
        }

        return NextResponse.json({
            success: true,
            message: `Flink SQL job "${name}" submitted.`,
        });
    } catch (error: any) {
        console.error("Flink job POST error:", error);
        const details =
            error?.body?.message || error?.response?.body?.message || error.message;
        return NextResponse.json(
            { error: "Failed to submit Flink job", details },
            { status: 500 }
        );
    }
}

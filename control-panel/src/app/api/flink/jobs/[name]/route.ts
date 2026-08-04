import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route";
import * as k8s from "@kubernetes/client-node";
import type { FlinkJobSummary } from "../route";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

const NAMESPACE = "aetherlake";

const FLINK_GROUP = "flink.apache.org";
const FLINK_VERSION = "v1beta1";
const FLINK_PLURAL = "flinkdeployments";

const VALID_JOB_NAME = /^[a-z]([-a-z0-9]{0,44}[a-z0-9])?$/;

function httpStatus(error: any): number | undefined {
    return error?.statusCode ?? error?.response?.statusCode;
}

function unwrap(res: unknown): any {
    return (res as any).body || res;
}

// GET: job detail — FlinkDeployment status plus the submitted SQL script
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await params;
    if (!VALID_JOB_NAME.test(name)) {
        return NextResponse.json({ error: "Valid job name is required" }, { status: 400 });
    }

    try {
        const deployment = unwrap(
            await customApi.getNamespacedCustomObject({
                group: FLINK_GROUP,
                version: FLINK_VERSION,
                namespace: NAMESPACE,
                plural: FLINK_PLURAL,
                name,
            })
        );

        let sql: string | null = null;
        try {
            const cm = unwrap(
                await k8sApi.readNamespacedConfigMap({
                    name: `${name}-sql`,
                    namespace: NAMESPACE,
                })
            );
            sql = cm?.data?.["job.sql"] ?? null;
        } catch { /* ConfigMap missing — return the job without its script */ }

        const status = deployment.status || {};
        const jobStatus = status.jobStatus || {};
        const job: FlinkJobSummary = {
            name: deployment.metadata?.name || name,
            state: jobStatus.state || "UNKNOWN",
            lifecycle: status.lifecycleState || status.jobManagerDeploymentStatus || "UNKNOWN",
            startTime: jobStatus.startTime || null,
            jobId: jobStatus.jobId || null,
            parallelism: deployment.spec?.job?.parallelism ?? 1,
            error: status.error || null,
        };

        return NextResponse.json({
            job,
            sql,
            flinkConfiguration: deployment.spec?.flinkConfiguration || {},
            image: deployment.spec?.image || null,
        });
    } catch (error: any) {
        if (httpStatus(error) === 404) {
            return NextResponse.json({ error: `Flink job "${name}" not found` }, { status: 404 });
        }
        console.error("Flink job GET error:", error);
        return NextResponse.json(
            { error: "Failed to read Flink job", details: error.message },
            { status: 500 }
        );
    }
}

// DELETE: cancel a Flink SQL job. Deleting the FlinkDeployment stops the job
// and tears down its mini-cluster (upgradeMode stateless — no savepoint); the
// SQL ConfigMap is removed afterwards. Admin only.
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if ((session.user as any)?.role !== "data-admin") {
        return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
    }

    const { name } = await params;
    if (!VALID_JOB_NAME.test(name)) {
        return NextResponse.json({ error: "Valid job name is required" }, { status: 400 });
    }

    try {
        await customApi.deleteNamespacedCustomObject({
            group: FLINK_GROUP,
            version: FLINK_VERSION,
            namespace: NAMESPACE,
            plural: FLINK_PLURAL,
            name,
        });
    } catch (error: any) {
        if (httpStatus(error) === 404) {
            return NextResponse.json({ error: `Flink job "${name}" not found` }, { status: 404 });
        }
        console.error("Flink job DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to cancel Flink job", details: error.message },
            { status: 500 }
        );
    }

    try {
        await k8sApi.deleteNamespacedConfigMap({
            name: `${name}-sql`,
            namespace: NAMESPACE,
        });
    } catch { /* job is already stopped; a stale ConfigMap is harmless */ }

    return NextResponse.json({
        success: true,
        message: `Flink job "${name}" cancelled.`,
    });
}

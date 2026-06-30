import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const metricsClient = new k8s.Metrics(kc);

const NAMESPACE = 'aetherlake';

// Display-name -> pod label selector. Mirrors api/status so the Observability
// page can filter pods by the same logical services shown on the dashboard.
export const SERVICE_POD_MAP: Record<string, { label: string; value: string }> = {
    'MinIO Storage': { label: 'v1.min.io/tenant', value: 'minio' },
    'Trino Analytics': { label: 'app.kubernetes.io/name', value: 'trino' },
    'Apache Airflow': { label: 'tier', value: 'airflow' },
    'Apache Superset': { label: 'app', value: 'superset' },
    'Milvus Vector Search': { label: 'app.kubernetes.io/name', value: 'milvus' },
    'Apache Polaris': { label: 'app', value: 'polaris' },
    'Keycloak': { label: 'app.kubernetes.io/name', value: 'keycloak' },
};

// Parse a Kubernetes CPU quantity (e.g. "12m", "1500000000n", "2") to millicores.
function cpuToMillicores(v?: string): number {
    if (!v) return 0;
    if (v.endsWith('n')) return parseFloat(v) / 1e6;       // nanocores
    if (v.endsWith('u')) return parseFloat(v) / 1e3;       // microcores
    if (v.endsWith('m')) return parseFloat(v);             // millicores
    return parseFloat(v) * 1000;                           // cores
}

// Parse a Kubernetes memory quantity (e.g. "128Mi", "1Gi", "1048576") to bytes.
function memToBytes(v?: string): number {
    if (!v) return 0;
    const units: Record<string, number> = {
        Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
        K: 1e3, M: 1e6, G: 1e9, T: 1e12,
    };
    const m = v.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)?$/);
    if (!m) return 0;
    const num = parseFloat(m[1]);
    const unit = m[2];
    return unit && units[unit] ? num * units[unit] : num;
}

function podPhase(pod: any): string {
    if (pod.metadata?.deletionTimestamp) return 'Terminating';
    const statuses = pod.status?.containerStatuses || [];
    // Surface a waiting reason (CrashLoopBackOff, ImagePullBackOff, ...) if present.
    for (const c of statuses) {
        const reason = c.state?.waiting?.reason;
        if (reason && reason !== 'ContainerCreating') return reason;
    }
    return pod.status?.phase || 'Unknown';
}

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const service = new URL(req.url).searchParams.get('service');
        const selector = service ? SERVICE_POD_MAP[service] : undefined;
        const labelSelector = selector ? `${selector.label}=${selector.value}` : undefined;

        const res = await coreApi.listNamespacedPod({ namespace: NAMESPACE, labelSelector });
        const pods = ((res as any).body?.items || (res as any).items || []) as any[];

        // Per-pod CPU/RAM from metrics-server. Best-effort: the API may be
        // unavailable (metrics-server not installed / still warming up).
        const usageByPod: Record<string, { cpuMilli: number; memBytes: number }> = {};
        try {
            const metrics = await metricsClient.getPodMetrics(NAMESPACE);
            for (const item of metrics.items) {
                let cpuMilli = 0;
                let memBytes = 0;
                for (const c of item.containers || []) {
                    cpuMilli += cpuToMillicores(c.usage?.cpu);
                    memBytes += memToBytes(c.usage?.memory);
                }
                usageByPod[item.metadata.name] = { cpuMilli, memBytes };
            }
        } catch {
            /* metrics unavailable — pods still returned without usage */
        }

        const result = pods.map((pod) => {
            const cs = pod.status?.containerStatuses || [];
            const ready = cs.filter((c: any) => c.ready).length;
            const total = cs.length || (pod.spec?.containers?.length ?? 0);
            const restarts = cs.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0);
            return {
                name: pod.metadata?.name,
                phase: podPhase(pod),
                ready,
                total,
                restarts,
                node: pod.spec?.nodeName || null,
                podIP: pod.status?.podIP || null,
                startTime: pod.status?.startTime || pod.metadata?.creationTimestamp || null,
                createdAt: pod.metadata?.creationTimestamp || null,
                labels: pod.metadata?.labels || {},
                usage: usageByPod[pod.metadata?.name] || null,
                containers: (pod.spec?.containers || []).map((spec: any) => {
                    const stat = cs.find((c: any) => c.name === spec.name);
                    const state = stat?.state || {};
                    const stateName = state.running ? 'Running' : state.waiting ? 'Waiting' : state.terminated ? 'Terminated' : 'Unknown';
                    return {
                        name: spec.name,
                        image: spec.image,
                        ready: stat?.ready ?? false,
                        restartCount: stat?.restartCount ?? 0,
                        state: stateName,
                        reason: state.waiting?.reason || state.terminated?.reason || null,
                        startedAt: state.running?.startedAt || null,
                    };
                }),
            };
        });

        // Sort: unhealthy first (so problems surface), then by name.
        result.sort((a, b) => {
            const aHealthy = a.ready === a.total && a.total > 0 ? 1 : 0;
            const bHealthy = b.ready === b.total && b.total > 0 ? 1 : 0;
            if (aHealthy !== bHealthy) return aHealthy - bHealthy;
            return (a.name || '').localeCompare(b.name || '');
        });

        return NextResponse.json({ pods: result, metricsAvailable: Object.keys(usageByPod).length > 0 });
    } catch (error: any) {
        console.error('Pods API error:', error);
        return NextResponse.json({ error: 'Failed to list pods', details: error.message }, { status: 500 });
    }
}

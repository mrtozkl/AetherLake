import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = 'aetherlake';

// Map service names to their pod label selectors
const SERVICE_POD_MAP: Record<string, { label: string; value: string }> = {
    'MinIO Storage': { label: 'v1.min.io/tenant', value: 'minio' },
    'Trino Analytics': { label: 'app.kubernetes.io/name', value: 'trino' },
    'Apache Airflow': { label: 'tier', value: 'airflow' },
    'Apache Superset': { label: 'app', value: 'superset' },
    'Milvus Vector Search': { label: 'app.kubernetes.io/name', value: 'milvus' },
    'Apache Polaris': { label: 'app', value: 'polaris' },
    'Keycloak': { label: 'app.kubernetes.io/name', value: 'keycloak' },
};

function getPodStatus(pod: any): 'Healthy' | 'Pending' | 'Offline' | 'Error' {
    const phase = pod.status?.phase;
    if (phase === 'Running') {
        const conditions = pod.status?.containerStatuses || [];
        const allReady = conditions.length > 0 && conditions.every((c: any) => c.ready);
        return allReady ? 'Healthy' : 'Pending';
    }
    if (phase === 'Pending') return 'Pending';
    return 'Offline';
}

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result: Record<string, string> = {};

        for (const [serviceName, selector] of Object.entries(SERVICE_POD_MAP)) {
            try {
                const res = await k8sApi.listNamespacedPod({
                    namespace: NAMESPACE,
                    labelSelector: `${selector.label}=${selector.value}`,
                });
                const pods = ((res as any).body?.items || (res as any).items || []) as any[];

                if (pods.length === 0) {
                    result[serviceName] = 'Offline';
                } else {
                    // Find the "best" status among all pods
                    const statuses = pods.map(getPodStatus);
                    if (statuses.includes('Healthy')) {
                        result[serviceName] = 'Healthy';
                    } else if (statuses.includes('Pending')) {
                        result[serviceName] = 'Pending';
                    } else {
                        result[serviceName] = 'Offline';
                    }
                }
            } catch {
                result[serviceName] = 'Unknown';
            }
        }

        // Unified SQL IDE depends on Trino and Polaris
        const trinoStatus = result['Trino Analytics'];
        const polarisStatus = result['Apache Polaris'];

        if (trinoStatus === 'Healthy' && polarisStatus === 'Healthy') {
            result['Unified SQL IDE'] = 'Healthy';
        } else if (trinoStatus === 'Pending' || polarisStatus === 'Pending') {
            result['Unified SQL IDE'] = 'Pending';
        } else {
            result['Unified SQL IDE'] = 'Offline';
        }

        return NextResponse.json(result);
    } catch (error: any) {
        console.error('Status API error:', error);
        return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
    }
}

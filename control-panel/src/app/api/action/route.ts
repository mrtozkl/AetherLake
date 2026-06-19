import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.AppsV1Api);

const NAMESPACE = 'aetherlake';

// Map service names to their Deployment/StatefulSet names
const SERVICE_DEPLOYMENT_MAP: Record<string, string> = {
    'MinIO Storage': 'minio',
    'Trino Analytics': 'core-data-stack-trino-coordinator', // Or worker, but coordinator is main
    'Apache Airflow': 'airflow-web',
    'Apache Superset': 'core-data-stack-superset',
    'Milvus Vector Search': 'core-data-stack-milvus-attu', // Restarting Attu UI or the proxy
    'Apache Polaris': 'core-data-stack-polaris',
    'Unified SQL IDE': 'control-panel',
    'Keycloak': 'security-stack-keycloak',
};

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isAdmin = (session.user as any)?.role === "data-admin";

        if (!isAdmin) {
            return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 });
        }

        const body = await req.json();
        const { serviceName, action } = body;

        if (!serviceName || action !== 'restart') {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }

        const deploymentName = SERVICE_DEPLOYMENT_MAP[serviceName];
        if (!deploymentName) {
            return NextResponse.json({ error: 'Service deployment mapping not found' }, { status: 404 });
        }

        // Trigger a rollout restart the same way `kubectl rollout restart` does:
        // a strategic-merge patch that sets a restartedAt annotation on the pod
        // template. Using a merge patch (instead of a JSON-patch `add`) means the
        // annotations map is created automatically if it doesn't already exist.
        const patch = {
            spec: {
                template: {
                    metadata: {
                        annotations: {
                            'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
                        },
                    },
                },
            },
        };

        await k8sApi.patchNamespacedDeployment(
            { name: deploymentName, namespace: NAMESPACE, body: patch },
            k8s.setHeaderOptions('Content-Type', k8s.PatchStrategy.StrategicMergePatch)
        );

        return NextResponse.json({ success: true, message: `${serviceName} restart initiated.` });
    } catch (error: any) {
        console.error('Action API error:', error);
        return NextResponse.json(
            { error: 'Failed to execute action', details: error.message },
            { status: 500 }
        );
    }
}

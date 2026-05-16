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

        const isAdmin = Boolean(
            session.user?.name === "admin" ||
            (session.user as any)?.role === "data-admin" ||
            session.user?.email?.includes("admin")
        );

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

        // Trigger a rollout restart by patching the deployment template annotations
        const patch = [
            {
                op: 'add',
                path: '/spec/template/metadata/annotations/kubectl.kubernetes.io~1restartedAt',
                value: new Date().toISOString(),
            },
        ];

        const options = { headers: { 'Content-type': 'application/json-patch+json' } };

        await (k8sApi.patchNamespacedDeployment as any)(
            deploymentName,
            NAMESPACE,
            patch,
            undefined,
            undefined,
            undefined,
            undefined,
            options
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

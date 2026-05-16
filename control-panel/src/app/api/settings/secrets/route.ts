import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const SECRET_NAME = 'aetherlake-credentials';
const NAMESPACE = 'aetherlake';

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const res = await k8sApi.readNamespacedSecret({ name: SECRET_NAME, namespace: NAMESPACE });
        const bodyValue = (res as any).body || res;
        const secretData = bodyValue.data || {};

        const decodedEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(secretData as Record<string, string>)) {
            decodedEnv[key] = Buffer.from(String(value), 'base64').toString('utf-8');
        }

        return NextResponse.json({
            keys: Object.keys(decodedEnv),
            message: "Configuration managed via Kubernetes Secrets API"
        });
    } catch (error: any) {
        console.error("Failed to read K8s secret", error);
        return NextResponse.json({ error: 'Failed to access cluster configurations' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const payload = await req.json();

        const encodedData: Record<string, string> = {};
        for (const [key, value] of Object.entries(payload)) {
            encodedData[key] = Buffer.from(String(value)).toString('base64');
        }

        try {
            const existing = await k8sApi.readNamespacedSecret({ name: SECRET_NAME, namespace: NAMESPACE });
            const existingObj = (existing as any).body || (existing as any).data || existing;
            const currentData = existingObj.data || {};
            const updatedSecret = { ...existingObj, data: { ...currentData, ...encodedData } };
            await k8sApi.replaceNamespacedSecret({ name: SECRET_NAME, namespace: NAMESPACE, body: updatedSecret });
        } catch {
            const newSecret: k8s.V1Secret = {
                metadata: { name: SECRET_NAME },
                data: encodedData,
                type: 'Opaque'
            };
            await k8sApi.createNamespacedSecret({ namespace: NAMESPACE, body: newSecret });
        }

        return NextResponse.json({ success: true, message: 'Configuration securely updated in cluster.' });
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to update K8s secret' }, { status: 500 });
    }
}

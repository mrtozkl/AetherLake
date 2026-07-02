import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const SECRET_NAME = 'aetherlake-credentials';
const NAMESPACE = 'aetherlake';

// Valid Kubernetes secret data key: alphanumerics, '-', '_' and '.'
const VALID_KEY = /^[A-Za-z0-9._-]{1,253}$/;

// Reading or mutating the platform credentials secret is an admin operation —
// a non-admin session must never be able to rotate other services' passwords.
async function requireAdmin() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'data-admin') {
        return NextResponse.json({ error: 'Forbidden. Admin access required.' }, { status: 403 });
    }
    return null;
}

export async function GET(req: Request) {
    const denied = await requireAdmin();
    if (denied) return denied;

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
    const denied = await requireAdmin();
    if (denied) return denied;

    try {
        const payload = await req.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return NextResponse.json({ error: 'Payload must be a JSON object' }, { status: 400 });
        }

        const encodedData: Record<string, string> = {};
        for (const [key, value] of Object.entries(payload)) {
            if (!VALID_KEY.test(key)) {
                return NextResponse.json({ error: `Invalid secret key: ${JSON.stringify(key)}` }, { status: 400 });
            }
            if (typeof value !== 'string') {
                return NextResponse.json({ error: `Value for "${key}" must be a string` }, { status: 400 });
            }
            encodedData[key] = Buffer.from(value).toString('base64');
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

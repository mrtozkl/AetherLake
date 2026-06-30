import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = 'aetherlake';

// GET /api/pods/events?pod=<name>
// Returns Kubernetes events, optionally scoped to a single pod. Newest first.
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pod = new URL(req.url).searchParams.get('pod');
        const fieldSelector = pod ? `involvedObject.name=${pod}` : undefined;

        const res = await coreApi.listNamespacedEvent({ namespace: NAMESPACE, fieldSelector });
        const items = ((res as any).body?.items || (res as any).items || []) as any[];

        const events = items.map((e) => {
            const last = e.lastTimestamp || e.eventTime || e.deprecatedLastTimestamp || e.metadata?.creationTimestamp || null;
            const first = e.firstTimestamp || e.metadata?.creationTimestamp || last;
            return {
                type: e.type || 'Normal',          // Normal | Warning
                reason: e.reason || '',
                message: e.message || e.note || '',
                object: `${e.involvedObject?.kind || ''}/${e.involvedObject?.name || ''}`,
                count: e.count || e.deprecatedCount || 1,
                firstTimestamp: first,
                lastTimestamp: last,
            };
        });

        events.sort((a, b) => {
            const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
            const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
            return tb - ta;
        });

        return NextResponse.json({ events });
    } catch (error: any) {
        console.error('Events API error:', error);
        return NextResponse.json({ error: 'Failed to list events', details: error.message }, { status: 500 });
    }
}

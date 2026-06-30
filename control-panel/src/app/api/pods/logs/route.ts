import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'node:stream';

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const logClient = new k8s.Log(kc);

const NAMESPACE = 'aetherlake';

// GET /api/pods/logs?pod=&container=&tail=&follow=&timestamps=&download=
//
// - follow=true  -> long-lived text/plain stream (live tail), aborts when the
//                   client disconnects.
// - follow=false -> one-shot snapshot of the last `tail` lines. With
//                   download=true the response is sent as a file attachment.
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(req.url).searchParams;
    const pod = params.get('pod');
    const container = params.get('container') || undefined;
    const follow = params.get('follow') === 'true';
    const download = params.get('download') === 'true';
    const timestamps = params.get('timestamps') === 'true';
    const tailLines = Math.min(parseInt(params.get('tail') || '500', 10) || 500, 10000);

    if (!pod) {
        return NextResponse.json({ error: 'pod is required' }, { status: 400 });
    }

    try {
        if (follow) {
            // Live stream. k8s.Log writes chunks to a Node Writable; bridge that
            // PassThrough into a web ReadableStream the route can return.
            const passthrough = new PassThrough();
            const controllerPromise = logClient.log(NAMESPACE, pod, container || '', passthrough, {
                follow: true,
                tailLines,
                timestamps,
                pretty: false,
            });

            let abort: AbortController | null = null;
            controllerPromise.then((c) => { abort = c; }).catch(() => { /* surfaced via stream error */ });

            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    passthrough.on('data', (chunk: Buffer) => {
                        try { controller.enqueue(new Uint8Array(chunk)); } catch { /* closed */ }
                    });
                    passthrough.on('end', () => { try { controller.close(); } catch { /* */ } });
                    passthrough.on('error', (err) => { try { controller.error(err); } catch { /* */ } });
                    req.signal.addEventListener('abort', () => {
                        abort?.abort();
                        passthrough.destroy();
                    });
                },
                cancel() {
                    abort?.abort();
                    passthrough.destroy();
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-cache, no-transform',
                    'X-Accel-Buffering': 'no',
                },
            });
        }

        // Snapshot: collect the whole stream into a buffer, then return.
        const passthrough = new PassThrough();
        const chunks: Buffer[] = [];
        const done = new Promise<void>((resolve, reject) => {
            passthrough.on('data', (c: Buffer) => chunks.push(c));
            passthrough.on('end', () => resolve());
            passthrough.on('error', reject);
        });
        await logClient.log(NAMESPACE, pod, container || '', passthrough, {
            follow: false,
            tailLines,
            timestamps,
            pretty: false,
        });
        await done;
        const text = Buffer.concat(chunks).toString('utf-8');

        const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8' };
        if (download) {
            const fname = `${pod}${container ? `-${container}` : ''}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
            headers['Content-Disposition'] = `attachment; filename="${fname}"`;
        }
        return new Response(text, { headers });
    } catch (error: any) {
        console.error('Logs API error:', error);
        return NextResponse.json({ error: 'Failed to fetch logs', details: error.message }, { status: 500 });
    }
}

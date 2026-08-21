import * as fs from "fs";
import * as k8s from "@kubernetes/client-node";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

// Trino serves HTTPS signed by the self-signed AetherLake CA, which Node does
// not trust out of the box. Resolve the CA bundle once, then route HTTPS
// calls through an undici agent that pins it. Lookup order:
//   1. TRINO_CA_FILE env var (explicit path)
//   2. control-panel/.ca/aetherlake-ca.crt — exported there by install.sh
//   3. the aetherlake-ca ConfigMap — when the panel runs inside the cluster
// If none resolves, calls fall back to the default trust store (e.g.
// NODE_EXTRA_CA_CERTS set by the operator).
export const TRINO_URL = process.env.TRINO_URL || "https://core-data-stack-trino:8443";

let cachedCa: string | undefined;
let caLookupDone = false;

async function loadTrinoCa(): Promise<string | undefined> {
    if (caLookupDone) return cachedCa;
    caLookupDone = true;
    const candidates = [
        process.env.TRINO_CA_FILE,
        ".ca/aetherlake-ca.crt",
        "control-panel/.ca/aetherlake-ca.crt",
    ].filter(Boolean) as string[];
    for (const p of candidates) {
        try {
            cachedCa = fs.readFileSync(p, "utf-8");
            return cachedCa;
        } catch { /* try next */ }
    }
    try {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const api = kc.makeApiClient(k8s.CoreV1Api);
        const res = await api.readNamespacedConfigMap({ name: "aetherlake-ca", namespace: "aetherlake" });
        const body = (res as any).body || res;
        const ca = body?.data?.["ca.crt"];
        if (ca) cachedCa = String(ca);
    } catch { /* cluster unreachable — fall back to default trust store */ }
    return cachedCa;
}

let tlsAgentPromise: Promise<Agent | undefined> | undefined;

function getTlsAgent(): Promise<Agent | undefined> {
    if (!tlsAgentPromise) {
        tlsAgentPromise = loadTrinoCa().then(ca =>
            ca ? new Agent({ connect: { ca, rejectUnauthorized: true } }) : undefined
        );
    }
    return tlsAgentPromise;
}

// fetch() that verifies AetherLake's self-signed TLS for Trino calls.
export async function trinoFetch(url: string, init: RequestInit): Promise<Response> {
    if (url.startsWith("https:")) {
        const agent = await getTlsAgent();
        if (agent) {
            // undici's BodyInit is structurally narrower than the DOM one;
            // the actual bodies we pass (strings) satisfy both.
            return (await undiciFetch(url, { ...(init as any), dispatcher: agent as Dispatcher })) as unknown as Response;
        }
    }
    return fetch(url, init);
}

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// Read one key from the platform credentials secret. Fails soft: undefined
// when the cluster/secret is unreachable.
export async function getSecretKey(key: string): Promise<string | undefined> {
    try {
        const res = await k8sApi.readNamespacedSecret({ name: "aetherlake-credentials", namespace: "aetherlake" });
        const body = (res as any).body || res;
        const value = body?.data?.[key];
        return value ? Buffer.from(String(value), "base64").toString("utf-8") : undefined;
    } catch {
        return undefined;
    }
}

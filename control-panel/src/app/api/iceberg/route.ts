import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

// Iceberg table explorer backend. Talks to the Polaris Iceberg REST catalog and
// shapes the verbose table metadata into a UI-friendly form.
const POLARIS_URL = process.env.POLARIS_URL || "http://core-data-stack-polaris:8181";
const CLIENT_ID = process.env.POLARIS_CLIENT_ID || "aetherlake-admin";
const CLIENT_SECRET = process.env.POLARIS_CLIENT_SECRET || "aetherlake-secret";
const CATALOG = process.env.POLARIS_CATALOG || "lakehouse_catalog";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
    const res = await fetch(`${POLARIS_URL}/api/catalog/v1/oauth/tokens`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: "PRINCIPAL_ROLE:ALL" }),
    });
    if (!res.ok) throw new Error("Polaris auth failed");
    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken!;
}

async function rest(path: string, token: string) {
    const res = await fetch(`${POLARIS_URL}/api/catalog/v1/${CATALOG}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const text = await res.text();
        throw Object.assign(new Error(`Polaris REST ${res.status}`), { status: res.status, body: text });
    }
    return res.json();
}

// Iceberg multipart namespaces are joined with the unit separator (0x1F) in the URL.
const nsPath = (ns: string) => ns.split(".").map(encodeURIComponent).join("%1F");

// Render an Iceberg field type (string or nested struct/list/map object) compactly.
function typeToString(t: any): string {
    if (typeof t === "string") return t;
    if (!t || typeof t !== "object") return String(t);
    if (t.type === "struct") return `struct<${(t.fields || []).map((f: any) => `${f.name}:${typeToString(f.type)}`).join(", ")}>`;
    if (t.type === "list") return `list<${typeToString(t.element)}>`;
    if (t.type === "map") return `map<${typeToString(t.key)}, ${typeToString(t.value)}>`;
    return t.type || "?";
}

function shapeTable(payload: any, namespace: string, table: string) {
    const md = payload.metadata || {};
    const schema = (md.schemas || []).find((s: any) => s["schema-id"] === md["current-schema-id"]) || md.schemas?.[0] || md.schema || {};
    const fields = (schema.fields || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        type: typeToString(f.type),
        required: !!f.required,
        doc: f.doc || null,
    }));
    const fieldNameById: Record<number, string> = {};
    for (const f of schema.fields || []) fieldNameById[f.id] = f.name;

    const spec = (md["partition-specs"] || []).find((s: any) => s["spec-id"] === md["default-spec-id"]) || md["partition-specs"]?.[0] || { fields: [] };
    const partitionFields = (spec.fields || []).map((pf: any) => ({
        name: pf.name,
        transform: pf.transform,
        sourceColumn: fieldNameById[pf["source-id"]] || `#${pf["source-id"]}`,
    }));

    const snapshots = (md.snapshots || []).map((s: any) => ({
        id: String(s["snapshot-id"]),
        parentId: s["parent-snapshot-id"] != null ? String(s["parent-snapshot-id"]) : null,
        timestampMs: s["timestamp-ms"],
        operation: s.summary?.operation || "—",
        summary: s.summary || {},
    })).sort((a: any, b: any) => b.timestampMs - a.timestampMs);

    const current = (md.snapshots || []).find((s: any) => s["snapshot-id"] === md["current-snapshot-id"]);
    const cs = current?.summary || {};

    return {
        name: table,
        namespace,
        location: md.location || null,
        formatVersion: md["format-version"] || null,
        uuid: md["table-uuid"] || null,
        currentSnapshotId: md["current-snapshot-id"] != null ? String(md["current-snapshot-id"]) : null,
        fields,
        partitionFields,
        snapshots,
        properties: md.properties || {},
        metrics: {
            totalRecords: cs["total-records"] != null ? Number(cs["total-records"]) : null,
            totalDataFiles: cs["total-data-files"] != null ? Number(cs["total-data-files"]) : null,
            totalFilesSize: cs["total-files-size"] != null ? Number(cs["total-files-size"]) : null,
        },
    };
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const params = new URL(req.url).searchParams;
    const action = params.get("action") || "namespaces";
    const namespace = params.get("namespace") || "";
    const table = params.get("table") || "";

    try {
        const token = await getToken();

        if (action === "namespaces") {
            const data = await rest(`/namespaces`, token);
            const namespaces = (data.namespaces || []).map((n: string[]) => n.join("."));
            return NextResponse.json({ namespaces });
        }

        if (action === "tables") {
            if (!namespace) return NextResponse.json({ error: "namespace required" }, { status: 400 });
            const data = await rest(`/namespaces/${nsPath(namespace)}/tables`, token);
            const tables = (data.identifiers || []).map((i: any) => i.name).sort();
            return NextResponse.json({ tables });
        }

        if (action === "table") {
            if (!namespace || !table) return NextResponse.json({ error: "namespace and table required" }, { status: 400 });
            const data = await rest(`/namespaces/${nsPath(namespace)}/tables/${encodeURIComponent(table)}`, token);
            return NextResponse.json(shapeTable(data, namespace, table));
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (e: any) {
        // Token may be stale (e.g. Polaris restarted) — drop the cache so the next call re-auths.
        if (e.status === 401) cachedToken = null;
        console.error("Iceberg API error:", e.message, e.body || "");
        return NextResponse.json({ error: "Iceberg catalog error", details: e.message }, { status: e.status || 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

const NAMESPACE = "aetherlake";
const CONFIGMAP_NAME = "core-data-stack-trino-catalog";
// Use the external ingress hostname as fallback so it works when running control-panel locally
const TRINO_URL = process.env.TRINO_URL || "http://trino.aetherlake.local";

// Helper: run a Trino SQL query server-side (reuses the polling loop from /api/query)
async function trinoQuery(sql: string): Promise<{ columns: any[]; data: any[][] }> {
    let targetUrl = `${TRINO_URL}/v1/statement`;
    let config: RequestInit = {
        method: "POST",
        headers: {
            "X-Trino-User": "admin",
            "X-Trino-Source": "control-panel-trino-mgmt",
            "Content-Type": "text/plain",
        },
        body: sql,
    };

    let finalData: any[][] = [];
    let finalColumns: any[] = [];
    let isDone = false;

    let response = await fetch(targetUrl, config);

    while (!isDone) {
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Trino error: ${response.statusText} - ${errText}`);
        }

        const json = await response.json();

        if (json.error) {
            throw new Error(json.error.message);
        }

        if (json.columns && finalColumns.length === 0) {
            finalColumns = json.columns;
        }

        if (json.data) {
            finalData = finalData.concat(json.data);
        }

        if (json.nextUri) {
            config = {
                method: "GET",
                headers: {
                    "X-Trino-User": "admin",
                    "X-Trino-Source": "control-panel-trino-mgmt",
                    "Content-Type": "text/plain",
                },
            };
            await new Promise((resolve) => setTimeout(resolve, 300));
            response = await fetch(json.nextUri, config);
        } else {
            isDone = true;
        }
    }

    return { columns: finalColumns, data: finalData };
}

// GET: List catalogs from ConfigMap + optionally fetch cluster info
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    try {
        // Action: cluster-info — returns Trino node info
        if (action === "cluster-info") {
            const result = await trinoQuery("SELECT * FROM system.runtime.nodes");
            return NextResponse.json(result);
        }

        // Action: session-properties — returns Trino session properties
        if (action === "session-properties") {
            const result = await trinoQuery("SHOW SESSION");
            // Map SHOW SESSION columns (Name, Value, Default, Type, Description)
            // to the expected format: { name, default_value, description }
            const mappedData = result.data.slice(0, 50).map((row: any[]) => [
                row[0], // name
                row[2], // default_value
                row[4], // description
            ]);

            return NextResponse.json({
                columns: [
                    { name: "name" },
                    { name: "default_value" },
                    { name: "description" }
                ],
                data: mappedData
            });
        }

        // Default: read catalogs from ConfigMap
        const res = await k8sApi.readNamespacedConfigMap({
            name: CONFIGMAP_NAME,
            namespace: NAMESPACE,
        });
        const cm = (res as any).body || res;
        const data = cm.data || {};

        // Parse each .properties file into structured data
        const catalogs: { name: string; connector: string; properties: Record<string, string> }[] = [];

        for (const [filename, content] of Object.entries(data)) {
            if (!filename.endsWith(".properties")) continue;
            const name = filename.replace(".properties", "");
            const props: Record<string, string> = {};

            (content as string).split("\n").forEach((line: string) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) return;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx > 0) {
                    props[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
                }
            });

            catalogs.push({
                name,
                connector: props["connector.name"] || "unknown",
                properties: props,
            });
        }

        return NextResponse.json({ catalogs });
    } catch (error: any) {
        console.error("Trino catalog GET error:", error);
        return NextResponse.json(
            { error: "Failed to read Trino catalogs", details: error.message },
            { status: 500 }
        );
    }
}

// POST: Add a new catalog to the ConfigMap
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { name, properties } = body;

        if (!name || !properties) {
            return NextResponse.json(
                { error: "Catalog name and properties are required" },
                { status: 400 }
            );
        }

        // Build the .properties file content
        const propsContent = Object.entries(properties as Record<string, string>)
            .filter(([_, v]) => v !== undefined && v !== "")
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");

        const filename = `${name}.properties`;

        // Read existing ConfigMap
        const res = await k8sApi.readNamespacedConfigMap({
            name: CONFIGMAP_NAME,
            namespace: NAMESPACE,
        });
        const cm = (res as any).body || res;
        const currentData = cm.data || {};

        if (currentData[filename]) {
            return NextResponse.json(
                { error: `Catalog "${name}" already exists` },
                { status: 409 }
            );
        }

        // Patch ConfigMap with new catalog
        const updatedCm = { ...cm, data: { ...currentData, [filename]: propsContent + "\n" } };
        await k8sApi.replaceNamespacedConfigMap({
            name: CONFIGMAP_NAME,
            namespace: NAMESPACE,
            body: updatedCm,
        });

        return NextResponse.json({
            success: true,
            message: `Catalog "${name}" added. Trino pods need a restart to pick up the change.`,
        });
    } catch (error: any) {
        console.error("Trino catalog POST error:", error);
        return NextResponse.json(
            { error: "Failed to add catalog", details: error.message },
            { status: 500 }
        );
    }
}

// DELETE: Remove a catalog from the ConfigMap
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const name = searchParams.get("name");

        if (!name) {
            return NextResponse.json({ error: "Catalog name is required" }, { status: 400 });
        }

        const filename = `${name}.properties`;

        const res = await k8sApi.readNamespacedConfigMap({
            name: CONFIGMAP_NAME,
            namespace: NAMESPACE,
        });
        const cm = (res as any).body || res;
        const currentData = cm.data || {};

        if (!currentData[filename]) {
            return NextResponse.json({ error: `Catalog "${name}" not found` }, { status: 404 });
        }

        delete currentData[filename];

        const updatedCm = { ...cm, data: currentData };
        await k8sApi.replaceNamespacedConfigMap({
            name: CONFIGMAP_NAME,
            namespace: NAMESPACE,
            body: updatedCm,
        });

        return NextResponse.json({
            success: true,
            message: `Catalog "${name}" removed. Trino pods need a restart to pick up the change.`,
        });
    } catch (error: any) {
        console.error("Trino catalog DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete catalog", details: error.message },
            { status: 500 }
        );
    }
}

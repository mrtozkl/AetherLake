import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";
import * as k8s from "@kubernetes/client-node";

const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

// Read one key from the platform credentials secret (dev-login Trino
// passwords). Fails soft: undefined when the cluster/secret is unreachable.
async function getSecretKey(key: string): Promise<string | undefined> {
    try {
        const res = await k8sApi.readNamespacedSecret({ name: "aetherlake-credentials", namespace: "aetherlake" });
        const body = (res as any).body || res;
        const value = body?.data?.[key];
        return value ? Buffer.from(String(value), "base64").toString("utf-8") : undefined;
    } catch {
        return undefined;
    }
}

// Resolve how this request authenticates to Trino. Trino enforces
// PASSWORD,JWT (no trusted X-Trino-User header anymore), so every query goes
// to the coordinator under a real identity:
// - Keycloak login  → the user's own access token (Bearer); Trino validates
//   the JWT and runs the query as the Keycloak username.
// - Dev credentials login → PASSWORD auth as the matching dev user, password
//   pulled from the aetherlake-credentials secret.
async function resolveTrinoAuth(session: any): Promise<{ headers: Record<string, string>; trinoUser: string }> {
    if (session?.accessToken) {
        const trinoUser = session.user?.username || session.user?.name || "unknown";
        return {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            trinoUser,
        };
    }
    const username = session?.user?.name;
    const secretKey =
        username === "admin" ? "trino-dev-admin-password"
        : username === "user" ? "trino-dev-user-password"
        : undefined;
    const password = secretKey ? await getSecretKey(secretKey) : undefined;
    if (username && password) {
        return {
            headers: { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}` },
            trinoUser: username,
        };
    }
    throw new Error("No Trino credential available for this session (expired Keycloak token or missing trino-dev-*-password secret key)");
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { query } = body;

        if (!query) {
            return NextResponse.json({ error: "Query is required" }, { status: 400 });
        }

        let auth: { headers: Record<string, string>; trinoUser: string };
        try {
            auth = await resolveTrinoAuth(session);
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 401 });
        }

        const baseUrl = process.env.TRINO_URL || "http://trino.aetherlake.local";
        let targetUrl = `${baseUrl}/v1/statement`;
        let config = {
            method: "POST",
            headers: {
                ...auth.headers,
                "X-Trino-Source": "control-panel-ide",
                "Content-Type": "text/plain",
            },
            body: query
        };

        // Standard Trino REST Polling Loop
        let finalData: any[] = [];
        let finalColumns: any[] = [];
        let errorMsg = null;
        let isDone = false;

        // Bound the Trino polling loop so a long-running or stuck query can't pin
        // the request open indefinitely. ~5 min at the 300ms inter-poll delay.
        const MAX_POLLS = 1000;
        let polls = 0;

        let response = await fetch(targetUrl, config);

        while (!isDone) {
            if (++polls > MAX_POLLS) {
                return NextResponse.json(
                    { error: "Query timed out", details: `Exceeded ${MAX_POLLS} Trino result polls` },
                    { status: 504 }
                );
            }

            if (!response.ok) {
                const errText = await response.text();
                const statusHint =
                    response.status === 401 ? " (authentication failed — session may have expired)"
                    : response.status === 403 ? " (access denied — your role does not allow this operation)"
                    : "";
                return NextResponse.json({ error: `Trino Request Failed: ${response.statusText}${statusHint}`, details: errText }, { status: response.status });
            }

            const jsonResponse = await response.json();

            if (jsonResponse.error) {
                return NextResponse.json({ error: jsonResponse.error.message, details: jsonResponse.error }, { status: 400 });
            }

            if (jsonResponse.columns && finalColumns.length === 0) {
                finalColumns = jsonResponse.columns;
            }

            if (jsonResponse.data) {
                finalData = finalData.concat(jsonResponse.data);
            }

            if (jsonResponse.nextUri) {
                targetUrl = jsonResponse.nextUri;
                config = {
                    method: "GET",
                    headers: {
                        ...auth.headers,
                        "X-Trino-Source": "control-panel-ide",
                        "Content-Type": "text/plain",
                    },
                    body: undefined
                } as any;

                // Add a small delay for large queries to prevent tight looping CPU burn
                await new Promise(resolve => setTimeout(resolve, 300));
                response = await fetch(targetUrl, config);
            } else {
                isDone = true;
            }
        }

        return NextResponse.json({ columns: finalColumns, data: finalData, executedAs: auth.trinoUser });

    } catch (error: any) {
        console.error("Query Execute Error:", error);
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../lib/auth";
import { TRINO_URL, trinoFetch, getSecretKey } from "../../../trino";

// Resolve how this request authenticates to Trino. Trino verifies both
// mechanisms itself over TLS (PASSWORD,JWT):
// - Keycloak login  → the user's own access token (Bearer); Trino validates
//   the JWT against the realm key and runs the query as that username.
// - Dev credentials login → PASSWORD auth as the matching dev user, password
//   read from the aetherlake-credentials secret.
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

        let targetUrl = `${TRINO_URL}/v1/statement`;
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

        let response = await trinoFetch(targetUrl, config);

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
                response = await trinoFetch(targetUrl, config);
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

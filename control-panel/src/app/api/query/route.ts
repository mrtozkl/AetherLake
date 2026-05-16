import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

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

        // We extract the user's email or default to 'admin' if not mapped perfectly.
        // In Keycloak, SSO usually populates email. Trino expects just a string identifier.
        // By injecting X-Trino-User, Trino RBAC checks the identity natively against authorized catalogs.
        const trinoUser = session.user.email || session.user.name || "admin";

        const baseUrl = process.env.TRINO_URL || "http://trino.aetherlake.local";
        let targetUrl = `${baseUrl}/v1/statement`;
        let config = {
            method: "POST",
            headers: {
                "X-Trino-User": trinoUser,
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

        let response = await fetch(targetUrl, config);

        while (!isDone) {
            if (!response.ok) {
                const errText = await response.text();
                return NextResponse.json({ error: `Trino Request Failed: ${response.statusText}`, details: errText }, { status: response.status });
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
                        "X-Trino-User": trinoUser,
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

        return NextResponse.json({ columns: finalColumns, data: finalData });

    } catch (error: any) {
        console.error("Query Execute Error:", error);
        return NextResponse.json({ error: "Internal Server Error", details: error.message }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

const POLARIS_URL = process.env.POLARIS_URL || "http://core-data-stack-polaris:8181";
const CLIENT_ID = process.env.POLARIS_CLIENT_ID || "aetherlake-admin";
// A hardcoded fallback secret must never reach a real deployment — require the
// env var in production, allow the dev placeholder otherwise.
const CLIENT_SECRET = process.env.POLARIS_CLIENT_SECRET
    || (process.env.NODE_ENV === "production" ? "" : "aetherlake-secret");

// Only Polaris API surfaces may be proxied; anything else (e.g. /q/ health &
// metrics, or future admin endpoints) stays internal.
const ALLOWED_PATH_PREFIXES = ["/api/catalog/", "/api/management/"];

// Token cache for internal client_credentials fallback
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getBootstrapToken() {
    if (!CLIENT_SECRET) {
        throw new Error("POLARIS_CLIENT_SECRET must be set in production");
    }
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const response = await fetch(`${POLARIS_URL}/api/catalog/v1/oauth/tokens`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "PRINCIPAL_ROLE:ALL",
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        console.error("Failed to get Polaris bootstrap token:", err);
        throw new Error("Polaris auth failed");
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}

async function handleProxy(req: NextRequest, method: string) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path") || "";
    const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

    // Reject traversal and anything outside the Polaris API allowlist.
    if (path.includes("..") || !ALLOWED_PATH_PREFIXES.some((p) => path.startsWith(p))) {
        return NextResponse.json({ error: "Path not allowed" }, { status: 400 });
    }

    // 1. Try to use User's Keycloak Token if available (OIDC Integration)
    // 2. Fall back to the bootstrap token — but only for admins: that token
    //    carries PRINCIPAL_ROLE:ALL, so handing it to any session would let
    //    every user act as the Polaris root principal.
    let token = (session as any).accessToken;
    const isUsingUserToken = !!token;

    if (!token) {
        if ((session.user as any)?.role !== "data-admin") {
            return NextResponse.json({ error: "Forbidden. Admin access required." }, { status: 403 });
        }
        try {
            token = await getBootstrapToken();
        } catch (e: any) {
            return NextResponse.json({ error: "Polaris Connection Error", details: e.message }, { status: 500 });
        }
    }

    const url = `${POLARIS_URL}${path}`;

    const headers: Record<string, string> = {
        "Authorization": `Bearer ${token}`,
        "Polaris-Realm": "POLARIS",
        "Content-Type": "application/json",
    };

    let fetchOpts: RequestInit = {
        method,
        headers
    };

    if (method !== "GET" && method !== "HEAD") {
        try {
            const body = await req.json();
            fetchOpts.body = JSON.stringify(body);
        } catch (e) {
            // No body or not JSON
        }
    }

    let response = await fetch(url, fetchOpts);

    // If 401 and we were using a bootstrap token, retry with a fresh one
    if (response.status === 401 && !isUsingUserToken) {
        cachedToken = null;
        try {
            token = await getBootstrapToken();
            response = await fetch(url, {
                ...fetchOpts,
                headers: { ...headers, Authorization: `Bearer ${token}` },
            });
        } catch (e) { }
    }

    if (!response.ok) {
        try {
            const errData = await response.json();
            return NextResponse.json(errData, { status: response.status });
        } catch (e) {
            const text = await response.text();
            return new NextResponse(text, { status: response.status });
        }
    }

    try {
        const data = await response.json();
        return NextResponse.json(data);
    } catch (e) {
        return new NextResponse(await response.text());
    }
}

export async function GET(req: NextRequest) { return handleProxy(req, "GET"); }
export async function POST(req: NextRequest) { return handleProxy(req, "POST"); }
export async function PUT(req: NextRequest) { return handleProxy(req, "PUT"); }
export async function DELETE(req: NextRequest) { return handleProxy(req, "DELETE"); }

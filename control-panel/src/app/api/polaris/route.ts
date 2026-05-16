import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]/route";

const POLARIS_URL = process.env.POLARIS_URL || "http://core-data-stack-polaris:8181";
const CLIENT_ID = process.env.POLARIS_CLIENT_ID || "aetherlake-admin";
const CLIENT_SECRET = process.env.POLARIS_CLIENT_SECRET || "aetherlake-secret";

// Token cache for internal client_credentials fallback
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getBootstrapToken() {
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
    const path = searchParams.get("path") || "";

    // 1. Try to use User's Keycloak Token if available (OIDC Integration)
    // 2. Fallback to Bootstrap Token for admin tasks or if user is logged in via Credentials
    let token = (session as any).accessToken;
    const isUsingUserToken = !!token;

    if (!token) {
        try {
            token = await getBootstrapToken();
        } catch (e: any) {
            return NextResponse.json({ error: "Polaris Connection Error", details: e.message }, { status: 500 });
        }
    }

    const url = `${POLARIS_URL}${path.startsWith("/") ? path : `/${path}`}`;

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

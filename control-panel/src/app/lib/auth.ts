import type { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import CredentialsProvider from "next-auth/providers/credentials";

const isProduction = process.env.NODE_ENV === "production";

// `next build` evaluates route modules with NODE_ENV=production to collect page
// data, but real secrets are not (and should not be) present at build time.
// Detect the build phase so we don't fail the build; the check still runs when
// the module is evaluated by the production server at runtime.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

// In production every secret must come from the environment. Falling back to a
// hardcoded value would ship a publicly-known secret, so fail fast instead.
export function requireInProduction(value: string | undefined, name: string, devFallback: string): string {
    if (value) return value;
    if (isProduction && !isBuildPhase) {
        throw new Error(`${name} must be set in production`);
    }
    return devFallback;
}

const nextAuthSecret = requireInProduction(
    process.env.NEXTAUTH_SECRET,
    "NEXTAUTH_SECRET",
    "insecure-development-only-secret"
);

const getCredentialsProvider = typeof CredentialsProvider === "function" ? CredentialsProvider : (CredentialsProvider as any).default;
const getKeycloakProvider = typeof KeycloakProvider === "function" ? KeycloakProvider : (KeycloakProvider as any).default;

const providers: any[] = [];

// Local username/password admin account. Only enabled outside production so a
// well-known credential can never be used against a real deployment. Keycloak
// SSO is the only supported auth path in production.
if (!isProduction && getCredentialsProvider) {
    providers.push(
        getCredentialsProvider({
            name: "AetherLake Admin (dev)",
            credentials: {
                username: { label: "Username", type: "text", placeholder: "admin" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials: any) {
                const validUsers = [
                    { id: "1", name: "admin", email: "admin@aetherlake.local", role: "data-admin" },
                    { id: "2", name: "user", email: "user@aetherlake.local", role: "data-scientist" },
                ];
                const user = validUsers.find(
                    (u: any) => u.name === credentials?.username && credentials?.password === credentials?.username
                );
                if (user) return user;
                return null;
            }
        })
    );
}

// Keycloak SSO (active when realm is provisioned)
if (getKeycloakProvider) {
    providers.push(
        getKeycloakProvider({
            clientId: process.env.KEYCLOAK_CLIENT_ID || "aetherlake-client",
        clientSecret: requireInProduction(
            process.env.KEYCLOAK_CLIENT_SECRET,
            "KEYCLOAK_CLIENT_SECRET",
            "dev-keycloak-secret"
        ),
        issuer: `${process.env.KEYCLOAK_URL || "http://keycloak.aetherlake.local"}/realms/aetherlake`
    })
);
}

// Map Keycloak realm roles to the app-level role used by admin-only API routes.
function roleFromKeycloakToken(accessToken: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf-8"));
        const roles: string[] = payload?.realm_access?.roles || [];
        if (roles.includes("data-admin")) return "data-admin";
        if (roles.includes("data-engineer")) return "data-engineer";
        if (roles.includes("data-scientist")) return "data-scientist";
    } catch { /* malformed token — leave role unset */ }
    return undefined;
}

// Keycloak username (preferred_username claim)
function usernameFromKeycloakToken(accessToken: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf-8"));
        return typeof payload?.preferred_username === "string" ? payload.preferred_username : undefined;
    } catch {
        return undefined;
    }
}

// Keycloak access tokens expire (minutes). Refresh them server-side.
async function refreshAccessToken(token: any) {
    try {
        const issuer = `${process.env.KEYCLOAK_URL || "http://keycloak.aetherlake.local"}/realms/aetherlake`;
        const response = await fetch(`${issuer}/protocol/openid-connect/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: process.env.KEYCLOAK_CLIENT_ID || "aetherlake-client",
                client_secret: requireInProduction(
                    process.env.KEYCLOAK_CLIENT_SECRET,
                    "KEYCLOAK_CLIENT_SECRET",
                    "dev-keycloak-secret"
                ),
                grant_type: "refresh_token",
                refresh_token: token.refreshToken,
            }),
        });
        const refreshed = await response.json();
        if (!response.ok) throw refreshed;
        return {
            ...token,
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token ?? token.refreshToken,
            accessTokenExpiresAt: Date.now() + (refreshed.expires_in ?? 300) * 1000,
            role: roleFromKeycloakToken(refreshed.access_token) ?? token.role,
        };
    } catch (error) {
        console.error("Keycloak token refresh failed:", error);
        return { ...token, error: "RefreshAccessTokenError" };
    }
}

export const authOptions: NextAuthOptions = {
    providers,
    secret: nextAuthSecret,
    callbacks: {
        async jwt({ token, account, user }: any) {
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.accessTokenExpiresAt = Date.now() + (account.expires_in ?? 300) * 1000;
                if (account.provider === "keycloak" && account.access_token) {
                    token.role = roleFromKeycloakToken(account.access_token) ?? token.role;
                    token.username = usernameFromKeycloakToken(account.access_token) ?? token.username;
                }
            }
            if (user?.role) {
                token.role = user.role;
            }
            if (!token.username && user?.name) {
                token.username = user.name;
            }
            if (!token.accessTokenExpiresAt || Date.now() < token.accessTokenExpiresAt - 30_000) {
                return token;
            }
            if (!token.refreshToken) return token;
            return refreshAccessToken(token);
        },
        async session({ session, token }: any) {
            (session as any).accessToken = token.accessToken;
            (session as any).error = token.error;
            if (token.role && session.user) {
                (session.user as any).role = token.role;
            }
            if (token.username && session.user) {
                (session.user as any).username = token.username;
            }
            return session;
        }
    }
};

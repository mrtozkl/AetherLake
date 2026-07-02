import NextAuth from "next-auth"
import KeycloakProvider from "next-auth/providers/keycloak"
import CredentialsProvider from "next-auth/providers/credentials"

const isProduction = process.env.NODE_ENV === "production"

// `next build` evaluates route modules with NODE_ENV=production to collect page
// data, but real secrets are not (and should not be) present at build time.
// Detect the build phase so we don't fail the build; the check still runs when
// the module is evaluated by the production server at runtime.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

// In production every secret must come from the environment. Falling back to a
// hardcoded value would ship a publicly-known secret, so fail fast instead.
function requireInProduction(value: string | undefined, name: string, devFallback: string): string {
    if (value) return value
    if (isProduction && !isBuildPhase) {
        throw new Error(`${name} must be set in production`)
    }
    return devFallback
}

const nextAuthSecret = requireInProduction(
    process.env.NEXTAUTH_SECRET,
    "NEXTAUTH_SECRET",
    "insecure-development-only-secret"
)

const providers: any[] = []

// Local username/password admin account. Only enabled outside production so a
// well-known credential can never be used against a real deployment. Keycloak
// SSO is the only supported auth path in production.
if (!isProduction) {
    providers.push(
        CredentialsProvider({
            name: "AetherLake Admin (dev)",
            credentials: {
                username: { label: "Username", type: "text", placeholder: "admin" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                const validUsers = [
                    { id: "1", name: "admin", email: "admin@aetherlake.local", role: "data-admin" },
                    { id: "2", name: "user", email: "user@aetherlake.local", role: "data-scientist" },
                ];
                const user = validUsers.find(
                    u => u.name === credentials?.username && credentials?.password === credentials?.username
                );
                if (user) return user;
                return null;
            }
        })
    )
}

// Keycloak SSO (active when realm is provisioned)
providers.push(
    KeycloakProvider({
        clientId: process.env.KEYCLOAK_CLIENT_ID || "aetherlake-client",
        clientSecret: requireInProduction(
            process.env.KEYCLOAK_CLIENT_SECRET,
            "KEYCLOAK_CLIENT_SECRET",
            "dev-keycloak-secret"
        ),
        issuer: `${process.env.KEYCLOAK_URL || "http://keycloak.aetherlake.local"}/realms/aetherlake`
    })
)

// Map Keycloak realm roles to the app-level role used by admin-only API routes.
// The access token arrives directly from Keycloak's token endpoint over the
// server-side OIDC exchange, so decoding its payload without re-verifying the
// signature is safe here.
function roleFromKeycloakToken(accessToken: string): string | undefined {
    try {
        const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf-8"))
        const roles: string[] = payload?.realm_access?.roles || []
        if (roles.includes("data-admin")) return "data-admin"
        if (roles.includes("data-engineer")) return "data-engineer"
        if (roles.includes("data-scientist")) return "data-scientist"
    } catch { /* malformed token — leave role unset */ }
    return undefined
}

export const authOptions = {
    providers,
    secret: nextAuthSecret,
    callbacks: {
        async jwt({ token, account, user }: any) {
            if (account) {
                token.accessToken = account.access_token
                if (account.provider === "keycloak" && account.access_token) {
                    token.role = roleFromKeycloakToken(account.access_token) ?? token.role
                }
            }
            if (user?.role) {
                token.role = user.role
            }
            return token
        },
        async session({ session, token }: any) {
            session.accessToken = token.accessToken
            if (token.role) {
                session.user.role = token.role
            }
            return session
        }
    }
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }


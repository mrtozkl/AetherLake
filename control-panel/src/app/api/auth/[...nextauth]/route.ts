import NextAuth from "next-auth"
import KeycloakProvider from "next-auth/providers/keycloak"
import CredentialsProvider from "next-auth/providers/credentials"

const isProduction = process.env.NODE_ENV === "production"

// In production every secret must come from the environment. Falling back to a
// hardcoded value would ship a publicly-known secret, so fail fast instead.
function requireInProduction(value: string | undefined, name: string, devFallback: string): string {
    if (value) return value
    if (isProduction) {
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

export const authOptions = {
    providers,
    secret: nextAuthSecret,
    callbacks: {
        async jwt({ token, account, user }: any) {
            if (account) {
                token.accessToken = account.access_token
            }
            if (user) {
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


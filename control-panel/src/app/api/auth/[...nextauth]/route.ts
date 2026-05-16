import NextAuth from "next-auth"
import KeycloakProvider from "next-auth/providers/keycloak"
import CredentialsProvider from "next-auth/providers/credentials"

export const authOptions = {
    providers: [
        // Default admin credentials for development / when Keycloak is unavailable
        CredentialsProvider({
            name: "AetherLake Admin",
            credentials: {
                username: { label: "Username", type: "text", placeholder: "admin" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                // Default admin account
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
        }),
        // Keycloak SSO (active when realm is provisioned)
        KeycloakProvider({
            clientId: process.env.KEYCLOAK_CLIENT_ID || "aetherlake-client",
            clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || "SUPER_SECRET_KEYCLOAK_PASSWORD",
            issuer: `${process.env.KEYCLOAK_URL || "http://keycloak.aetherlake.local"}/realms/aetherlake`
        })
    ],
    secret: process.env.NEXTAUTH_SECRET || "super-secret-aetherlake-development-key",
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


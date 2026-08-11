# Keycloak — Identity & SSO

Keycloak is the single OIDC/SSO provider for the whole platform. It ships in the
**`security-stack`** chart on upstream images (no Bitnami), alongside its own
dedicated PostgreSQL.

- **Image:** `quay.io/keycloak/keycloak:26.3.3`
- **Realm import tool:** `adorsys/keycloak-config-cli:6.5.1-26`
- **Realm:** `aetherlake`
- **Issuer:** `http://keycloak.aetherlake.local/realms/aetherlake`
- **Ingress:** `keycloak.aetherlake.local` → `security-stack-keycloak:80`

## Architecture

```mermaid
graph LR
    CLI[keycloak-config-cli Job] -->|import realm JSON| KC[Keycloak]
    KC --> PG[(keycloak-postgres)]
    Secret[aetherlake-credentials] -.client secrets.-> CLI
    KC -. discovery/tokens .- Services[All OIDC services]
```

The realm (`helm-charts/security-stack/files/aetherlake-realm.json`) is imported
by a `keycloak-config-cli` Job after Keycloak starts.

## Realm clients

| Client ID | Used by | Secret key (in `aetherlake-credentials`) |
|-----------|---------|------------------------------------------|
| `aetherlake-client` | Control Panel | `control-panel-oidc-secret` |
| `oauth2-proxy` | SSO gate for Trino UI & Milvus Attu | `oauth2-proxy-oidc-secret` |
| `trino` | Trino | `trino-oidc-secret` |
| `airflow` | Airflow web UI | `airflow-oidc-secret` |
| `polaris` | Polaris | `polaris-oidc-secret` |
| `minio` | MinIO console | `minio-oidc-secret` |
| `superset` | Superset | `superset-oidc-secret` |

### Trino validates tokens directly

Beyond browser SSO, Trino also verifies `aetherlake-client` access tokens on
its own: the Control Panel forwards the logged-in user's token with every SQL
query, and Trino accepts it after checking the realm's RSA key
(`trino-jwt-key` ConfigMap, maintained by `install.sh`). That is how each
query runs under the submitter's own username and role — see
[Trino — Authentication](./trino#authentication-every-query-runs-as-a-real-user).

### Realm roles → app roles

| Realm role | Trino group | Airflow | Superset | MinIO policy |
|------------|-------------|---------|----------|--------------|
| `data-admin` | `data-admin` | `Admin` | `Admin` | `consoleAdmin` |
| `data-engineer` | `data-engineer` | `Op` | `Alpha` | — |
| `data-scientist` | `data-scientist` | `User` | `Alpha` | — |
| *(others)* | *(none)* | `Public` | `Gamma` | — |

Trino group membership is maintained in `install.sh` (the `group.db` it
renders) — assign the realm role *and* add the username to the matching
group line.

## SSO gate (oauth2-proxy)

Trino's web UI and Milvus Attu have no native OIDC support, so they sit behind
an **oauth2-proxy** deployment (`core-data-stack/templates/oauth2-proxy.yaml`,
toggled by `sso.enabled`, image `quay.io/oauth2-proxy/oauth2-proxy:v7.7.1`).
The protected ingresses (`trino.aetherlake.local`, `milvus.aetherlake.local`)
carry nginx external-auth annotations pointing at it:

- Anonymous browser requests are redirected to `oauth2.aetherlake.local`
  (its own ingress host), which runs the Keycloak OIDC flow and sets a session
  cookie scoped to `.aetherlake.local` — **one login covers every gated host**.
- `install.sh` generates the two secrets the proxy needs:
  `oauth2-proxy-oidc-secret` (client secret) and `oauth2-proxy-cookie-secret`
  (16-byte cookie signing key).
- Users created by keycloak-config-cli carry no verified-email flag, so the
  proxy runs with `insecure-oidc-allow-unverified-email`; rejecting them would
  lock everyone out.
- After the gate, Trino serves its web UI with the fixed service user
  (`web-ui.authentication.type=fixed`, `web-ui.user=aetherlake-ui`) instead of
  a second login form. In-cluster callers (Control Panel, MCP server) reach
  `core-data-stack-trino:8080` directly and never hit the gate.

::: warning
Trino itself runs unauthenticated and trusts the `X-Trino-User` header — the
ingress route must never be reachable anonymously. Do not remove the external
auth annotations from `aetherlake-trino-ingress`.
:::

## Key settings (`security-stack/values.yaml`)

| Setting | Default | Description |
|---------|---------|-------------|
| `keycloak.image` | `quay.io/keycloak/keycloak:26.3.3` | Server image |
| `keycloak.auth.adminUser` | `admin` | Admin console user |
| `keycloak.auth.passwordSecretKey` | `keycloak-admin-password` | Admin password key in the secret |
| `keycloak.postgres.passwordSecretKey` | `keycloak-db-password` | DB password key — separate from the shared `postgres-password` ([why](./postgres#why-keycloak-keeps-its-own-database)) |
| `keycloak.extraEnvVars[KC_HOSTNAME]` | `keycloak.aetherlake.local` | Public hostname |
| `keycloak.extraEnvVars[KC_HOSTNAME_STRICT]` | `false` | Allow non-strict hostname |
| `keycloak.extraEnvVars[KC_PROXY_HEADERS]` | `xforwarded` | Behind the ingress |
| `keycloakConfigCli.enabled` | `true` | Run the realm import Job |

## The two SSO gotchas (already fixed in this chart)

::: danger keycloak-config-cli variable substitution
The realm references client secrets as **`$(env:VAR)`** — not `${ENV:VAR}` —
because config-cli deliberately uses `$(...)` to avoid clashing with Keycloak's
own `${...}` placeholders, **and** substitution is **disabled by default**.
Both are required: `IMPORT_VARSUBSTITUTION_ENABLED=true` is set in
`keycloakConfigCli.extraEnvVars`, and every confidential client carries an
explicit `"secret": "$(env:...)"`. Without this, OIDC handshakes fail with a
literal/auto-generated secret.
:::

::: warning In-cluster DNS
`install.sh` adds a CoreDNS rewrite so `keycloak.aetherlake.local` resolves to
the Keycloak Service inside the cluster. Otherwise MinIO blocks its entire IAM
subsystem ("Waiting for OpenID to be initialized") and all server-side OIDC
discovery times out.
:::

## Operations

```bash
# Admin password
kubectl get secret aetherlake-credentials -n aetherlake \
  -o jsonpath='{.data.keycloak-admin-password}' | base64 -d

# Verify a client secret matches (client_credentials → expect HTTP 200)
SECRET=$(kubectl get secret aetherlake-credentials -n aetherlake \
  -o jsonpath='{.data.minio-oidc-secret}' | base64 -d)
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST http://security-stack-keycloak/realms/aetherlake/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=minio -d client_secret="$SECRET"
```

#!/bin/bash
# Trino per-user auth & access-control verification battery (TLS edition).
# Run after install.sh completes and Trino pods are Ready.
NS=aetherlake
TRINO_PORT=18443
CA=/tmp/aetherlake-ca-verify.crt

say() { printf '\n== %s\n' "$1"; }

get_secret() { kubectl get secret aetherlake-credentials -n $NS -o jsonpath="{.data.$1}" | base64 -d; }

# --- Keycloak token helper (password grant through a port-forward) ----------
keycloak_token() { # $1=username $2=password
    curl -s -X POST http://localhost:18481/realms/aetherlake/protocol/openid-connect/token \
        -d "client_id=aetherlake-client" \
        -d "client_secret=$(get_secret control-panel-oidc-secret)" \
        -d "username=$1" -d "password=$2" -d "grant_type=password" \
        | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))'
}

# --- Trino query helper over TLS: follows nextUri, prints rows or the error -
trino_query() { # $1=auth-header-value $2=SQL
    python3 - "$1" "$2" <<'PYEOF'
import json, subprocess, sys
auth, sql = sys.argv[1], sys.argv[2]
CA = "/tmp/aetherlake-ca-verify.crt"
PORT = "18443"

def curl(url, method):
    cmd = ["curl", "-s", "--cacert", CA, "-H", f"Authorization: {auth}", "-X", method]
    if method == "POST":
        cmd += ["-d", sql]
    cmd.append(url)
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout or "{}")

url = f"https://localhost:{PORT}/v1/statement"
method = "POST"
rows = []
for _ in range(40):
    j = curl(url, method)
    if j.get("error"):
        print("ERROR:", j["error"].get("message", "")[:180]); sys.exit()
    rows += j.get("data") or []
    nxt = j.get("nextUri")
    if not nxt:
        print("ROWS:", rows if rows else "(no rows)")
        sys.exit()
    url, method = nxt, "GET"
print("TIMEOUT following nextUri")
PYEOF
}

status_only() { # $1=auth-header-value (or empty) $2=SQL -> HTTP code
    if [ -z "$1" ]; then
        curl -s --cacert "$CA" -o /dev/null -w '%{http_code}' -X POST "https://localhost:$TRINO_PORT/v1/statement" -d "$2"
    else
        curl -s --cacert "$CA" -o /dev/null -w '%{http_code}' -H "Authorization: $1" -X POST "https://localhost:$TRINO_PORT/v1/statement" -d "$2"
    fi
}

kubectl get secret aetherlake-root-ca -n cert-manager -o jsonpath='{.data.ca\.crt}' | base64 -d > "$CA"
kubectl port-forward -n $NS svc/security-stack-keycloak 18481:80 >/dev/null 2>&1 &
KC_PF=$!
kubectl port-forward -n $NS svc/core-data-stack-trino $TRINO_PORT:8443 >/dev/null 2>&1 &
TR_PF=$!
trap 'kill $KC_PF $TR_PF 2>/dev/null' EXIT
sleep 4

say "0. TLS handshake with CA verification"
curl -s --cacert "$CA" -o /dev/null -w 'HTTP %{http_code} (SSL verify OK)\n' "https://localhost:$TRINO_PORT/v1/info" || echo "TLS FAILED"

say "1. Unauthenticated request (expect 401)"
echo "HTTP $(status_only "" 'SHOW CATALOGS')"

say "2. admin (dev PASSWORD user, data-admin): SHOW CATALOGS + system access"
ADMINPW=$(get_secret trino-dev-admin-password)
trino_query "Basic $(printf 'admin:%s' "$ADMINPW" | base64)" 'SHOW CATALOGS'
trino_query "Basic $(printf 'admin:%s' "$ADMINPW" | base64)" 'SELECT count(*) FROM system.runtime.nodes'

say "3. elif (Keycloak JWT, data-engineer)"
ELIF_TOKEN=$(keycloak_token elif aetherlake-demo)
if [ -z "$ELIF_TOKEN" ]; then echo "TOKEN FAILED"; else
    echo "principal check via whoami-ish query:"
    trino_query "Bearer $ELIF_TOKEN" 'SELECT current_user'
    trino_query "Bearer $ELIF_TOKEN" 'SHOW CATALOGS'
    echo "system catalog (expect ERROR Access Denied):"
    trino_query "Bearer $ELIF_TOKEN" 'SELECT count(*) FROM system.runtime.nodes'
    echo "CREATE on iceberg (expect success; DROP is blocked by Polaris purge policy, not RBAC):"
    trino_query "Bearer $ELIF_TOKEN" 'CREATE SCHEMA IF NOT EXISTS iceberg.rbac_test'
    trino_query "Bearer $ELIF_TOKEN" 'CREATE TABLE IF NOT EXISTS iceberg.rbac_test.t (id int)'
fi

say "4. deniz (Keycloak JWT, data-scientist)"
DENIZ_TOKEN=$(keycloak_token deniz aetherlake-demo)
if [ -z "$DENIZ_TOKEN" ]; then echo "TOKEN FAILED"; else
    trino_query "Bearer $DENIZ_TOKEN" 'SELECT current_user'
    trino_query "Bearer $DENIZ_TOKEN" 'SHOW CATALOGS'
    echo "system catalog (expect ERROR Access Denied):"
    trino_query "Bearer $DENIZ_TOKEN" 'SELECT count(*) FROM system.runtime.nodes'
    echo "CREATE SCHEMA (expect ERROR Access Denied):"
    trino_query "Bearer $DENIZ_TOKEN" 'CREATE SCHEMA iceberg.should_fail'
fi

say "5. mcp service user (PASSWORD, read-only)"
MCPPW=$(get_secret trino-mcp-password)
trino_query "Basic $(printf 'mcp:%s' "$MCPPW" | base64)" 'SHOW CATALOGS'
echo "CREATE SCHEMA (expect ERROR Access Denied):"
trino_query "Basic $(printf 'mcp:%s' "$MCPPW" | base64)" 'CREATE SCHEMA iceberg.nope'

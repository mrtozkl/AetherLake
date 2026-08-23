# 📡 AetherLake Anonymous Telemetry & Health Monitoring

AetherLake includes an automated anonymous telemetry mechanism enabled by default across all installations. This allows platform maintainers to track global deployments, detect runtime cloud environments (AWS, Azure, etc.), monitor platform health, and prioritize features.

---

## 🎯 1. Where Does Telemetry Send? (Endpoint Configuration)

By default, telemetry sends events to the central collector endpoint:
- **Default Endpoint**: `https://aetherlake-telemetry.mrtozkl.workers.dev/v1/ping`
- **Configurable**: You can override this to point to your own custom server, VPS, or webhook at any time.

### 🌐 Directing Telemetry to a Custom Server / Endpoint

If you deploy your own telemetry backend or proxy (e.g. Cloudflare Worker or HTTPS webhook), you can configure your AetherLake clusters to send data to your custom endpoint:

1. **In Helm (`values.yaml` or CLI)**:
   ```yaml
   telemetry:
     enabled: true
     endpoint: "https://your-telemetry-domain.com/v1/ping"
   ```
   Or via command line:
   ```bash
   helm upgrade --install core-data-stack ./helm-charts/core-data-stack \
     --set telemetry.endpoint="https://your-telemetry-domain.com/v1/ping"
   ```

2. **In Environment Variables**:
   ```bash
   TELEMETRY_ENDPOINT=https://your-telemetry-domain.com/v1/ping
   # or
   AETHERLAKE_TELEMETRY_ENDPOINT=https://your-telemetry-domain.com/v1/ping
   ```

3. **In `install.sh`**:
   ```bash
   TELEMETRY_ENDPOINT=https://your-telemetry-domain.com/v1/ping ./install.sh
   ```

---

## ⚡ 2. Automatic Enablement (Default ON)

Telemetry is **automatically enabled on every installation** out of the box:
- `install.sh` automatically creates an anonymous `cluster-id` and dispatches an install ping.
- The Kubernetes CronJob (`templates/telemetry-cronjob.yaml`) is scheduled by default for periodic daily heartbeats.
- The Next.js Control Panel automatically tracks platform uptime and cloud provider status.

---

## 🚫 3. How Users Can Opt-Out (Disable Telemetry)

Users can easily disable telemetry at any level using standard environment variables or Helm flags.

### Option A: Environment Variables (Any of the following)
```bash
# Standard opt-out variable
TELEMETRY_ENABLED=false

# Platform-specific opt-out
AETHERLAKE_TELEMETRY_ENABLED=false

# Industry-standard Do Not Track
DO_NOT_TRACK=1
```
*(Accepted disable values: `false`, `0`, `no`, `off`, `disabled`)*

### Option B: Helm (`values.yaml` or CLI)
```yaml
telemetry:
  enabled: false
```
Or via Helm command:
```bash
helm upgrade --install core-data-stack ./helm-charts/core-data-stack \
  --set telemetry.enabled=false
```

### Option C: Installer Script
```bash
TELEMETRY_ENABLED=false ./install.sh
# or
DO_NOT_TRACK=1 ./install.sh
```

---

## 📊 4. Data Payload Transparency

| Field | Description | Example |
|---|---|---|
| `cluster_id` | Anonymous hash identifier generated during install | `cl-8f3a9b1c0e4d` |
| `cloud_provider` | Detected Kubernetes runtime/cloud environment | `aws`, `azure`, `gcp`, `docker-desktop`, `minikube` |
| `app_version` | Release version of AetherLake | `1.0.0` |
| `chart_version` | Helm chart version | `0.1.0` |
| `k8s_version` | Kubernetes control plane version | `v1.29.2` |
| `node_count` | Number of active nodes in the cluster | `5` |
| `uptime_seconds` | Platform running time | `86400` |
| `components` | Status of enabled components | `{ "trino": true, "polaris": true, "kafka": true, "flink": true }` |
| `timestamp` | ISO timestamp of the event | `2026-08-22T12:00:00Z` |

> [!NOTE]
> **No PII or Lakehouse Data**: We never collect usernames, emails, IP addresses, database schemas, table contents, or SQL queries.

# Troubleshooting & Operations Guide

This guide provides practical troubleshooting steps, diagnostic commands, and recovery procedures for common operational issues encountered in an AetherLake cluster.

---

## 🩺 Diagnostic Quick Reference

When diagnosing cluster issues, start by checking overall health:

```bash
# 1. View all pods and statuses in the AetherLake namespace
kubectl get pods -n aetherlake -o wide

# 2. Inspect Kubernetes events (warnings, scheduling failures, container crashes)
kubectl get events -n aetherlake --sort-by='.lastTimestamp' | tail -n 30

# 3. Check health and ready conditions of Kafka clusters (Strimzi)
kubectl get kafka,kafkanodepool,kafkatopic -n aetherlake

# 4. Check status of Flink deployments
kubectl get flinkdeployments -n aetherlake

# 5. Check Ingress and TLS certificate status
kubectl get ingress,certificate -n aetherlake
```

---

## 🛑 Common Issues & Solutions

### 1. Pods Stuck in `Pending`

#### Symptoms
Pods remain in `Pending` state indefinitely, or describe shows `0/X nodes are available`.

#### Root Causes & Solutions
- **Insufficient Node Resources (CPU/Memory)**:
  Check node capacity:
  ```bash
  kubectl describe nodes | grep -A 8 "Allocated resources"
  ```
  *Solution*: If running locally (Docker Desktop / Minikube), allocate at least **8 CPU cores** and **16 GB RAM** to your virtual machine in Docker/Minikube settings. If on cloud, scale your node group or reduce replica counts in `values.yaml`.
- **Missing or Misconfigured StorageClass for PVCs**:
  Check PersistentVolumeClaims:
  ```bash
  kubectl get pvc -n aetherlake
  ```
  If PVCs are stuck in `Pending`, ensure a default StorageClass exists:
  ```bash
  kubectl get storageclass
  ```
  *Solution*: Mark your storage class as default:
  ```bash
  kubectl patch storageclass <storage-class-name> -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
  ```

---

### 2. Pods in `CrashLoopBackOff`

#### Symptoms
Pods crash immediately on startup and enter `CrashLoopBackOff`.

#### Root Causes & Solutions
- **Check Previous Container Logs**:
  ```bash
  kubectl logs <pod-name> -n aetherlake --previous
  ```
- **Shared Secrets Missing**:
  All services require the `aetherlake-credentials` secret. Verify it exists and has non-empty keys:
  ```bash
  kubectl get secret aetherlake-credentials -n aetherlake -o jsonpath='{.data}'
  ```
  *Solution*: Run `./install.sh` again to backfill missing randomized credentials without overwriting existing ones.

---

### 3. CoreDNS & In-Cluster Domain Resolution

#### Symptoms
- Services fail to talk to Keycloak with `ENOTFOUND keycloak.aetherlake.local` or `Connection refused`.
- Keycloak OIDC metadata discovery fails from Trino, Superset, or Airflow.

#### Root Causes & Solutions
- `keycloak.aetherlake.local` must resolve **both outside** the cluster (via your local `/etc/hosts`) and **inside** the cluster (via CoreDNS).
- *Solution*: Verify the CoreDNS rewrite rule added by `install.sh`:
  ```bash
  kubectl get configmap coredns -n kube-system -o yaml
  ```
  Ensure it contains the rewrite directive:
  ```text
  rewrite name regex (.*)\.aetherlake\.local ingress-nginx-controller.ingress-nginx.svc.cluster.local
  ```
  If missing or broken, restart CoreDNS after reapplying:
  ```bash
  kubectl rollout restart deployment coredns -n kube-system
  ```

---

### 4. TLS & Certificate Verification Failures

#### Symptoms
- Trino CLI, dbt, or MCP server fails with `CERT_HAS_EXPIRED`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or Java `SSLHandshakeException: PKIX path building failed`.

#### Root Causes & Solutions
AetherLake uses TLS on Trino (port 8443) and external Kafka (port 9094) signed by a local root CA (`aetherlake-root-ca`).

- **For Node.js / Control Panel / MCP Server**:
  Export the root CA certificate and provide it via `NODE_EXTRA_CA_CERTS`:
  ```bash
  kubectl get secret aetherlake-root-ca -n cert-manager \
    -o jsonpath='{.data.ca\.crt}' | base64 -d > ~/.aetherlake-ca.crt

  export NODE_EXTRA_CA_CERTS="$HOME/.aetherlake-ca.crt"
  ```
- **For Python / dbt / Airflow**:
  Pass the CA certificate file path to your connection profile:
  ```bash
  export REQUESTS_CA_BUNDLE="$HOME/.aetherlake-ca.crt"
  ```
- **For Java / Spark**:
  Import the certificate into the Java Truststore:
  ```bash
  keytool -import -trustcacerts -alias aetherlake-ca \
    -file ~/.aetherlake-ca.crt -keystore $JAVA_HOME/lib/security/cacerts -storepass changeit -noprompt
  ```

---

### 5. Trino Query Failures & Memory Limits

#### Symptoms
- Queries fail with `Query exceeded distributed user memory limit of ...` or `Trino worker heartbeat lost`.

#### Root Causes & Solutions
- **Memory Pressure**:
  Inspect Trino coordinator logs:
  ```bash
  kubectl logs -n aetherlake -l app.kubernetes.io/component=coordinator -c trino-coordinator --tail=100
  ```
- *Solution*: Increase Trino JVM memory and query memory limits in `values.yaml`:
  ```yaml
  trino:
    server:
      jvm:
        maxHeapSize: "8G"
      config:
        query:
          maxMemory: "16GB"
          maxMemoryPerNode: "4GB"
  ```
- **OOMKilled Pods**:
  Check if Kubernetes killed the worker container:
  ```bash
  kubectl describe pod -l app.kubernetes.io/component=worker -n aetherlake | grep -i "oomkilled"
  ```
  If true, raise the container memory limits under `trino.worker.resources.limits.memory`.

---

### 6. Apache Polaris (Iceberg REST) 401/403 Errors

#### Symptoms
- Flink or Trino cannot access Iceberg tables: `401 Unauthorized` or `403 Forbidden` from Polaris catalog endpoint.

#### Root Causes & Solutions
- **Credential Mismatch**:
  Polaris authenticates clients via OAuth2 client credentials (`id:secret`).
  Verify client credentials in the cluster secret:
  ```bash
  kubectl get secret aetherlake-credentials -n aetherlake \
    -o jsonpath='{.data.polaris-credential}' | base64 -d
  ```
  Ensure Trino's `iceberg.properties` catalog config matches this credential.
- **S3 Credential Vending**:
  Polaris vends MinIO/S3 STS tokens to query engines. Verify MinIO has the `lakehouse` bucket provisioned:
  ```bash
  kubectl exec -it -n aetherlake deploy/aetherlake-minio -- mc ls local/
  ```

---

### 7. Kafka & Strimzi Issues

#### Symptoms
- Topic creation fails, or consumers cannot connect to `aetherlake-kafka-bootstrap:9092`.

#### Root Causes & Solutions
- **Check Strimzi Cluster Operator**:
  ```bash
  kubectl logs -n aetherlake deployment/strimzi-cluster-operator --tail=100
  ```
- **Check Kafka Node Pool**:
  ```bash
  kubectl describe kafkanodepool -n aetherlake
  ```
- **External Client Connection**:
  External access requires authentication. Retrieve the SCRAM-SHA-512 password for user `external-producer`:
  ```bash
  kubectl get secret external-producer -n aetherlake \
    -o jsonpath='{.data.password}' | base64 -d
  ```

---

### 8. Flink SQL Job Failures & Checkpointing

#### Symptoms
- Flink jobs enter `FAILING` or `RESTARTING` status.
- Checkpoint timeouts in MinIO.

#### Root Causes & Solutions
- **Inspect Flink Application Pods**:
  ```bash
  kubectl get pods -n aetherlake -l type=flink-native-kubernetes
  kubectl logs -n aetherlake -l type=flink-native-kubernetes -c flink-main-container --tail=100
  ```
- **MinIO Storage Connectivity**:
  Flink writes checkpoints to `s3://lakehouse/flink-checkpoints/`. If MinIO is unreachable or credentials expired, checkpointing will fail. Ensure the secret keys `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` are mounted correctly in the FlinkDeployment manifest.

---

### 9. Control Panel NextAuth & Session Issues

#### Symptoms
- Logging in immediately redirects back to `/api/auth/signin?error=SessionRequired` or returns `Internal Server Error`.

#### Root Causes & Solutions
- **Production Mode Secret Missing**:
  In production builds (`next start` or container), `NEXTAUTH_SECRET` is mandatory:
  ```bash
  # Check NextAuth secret in pod
  kubectl exec -n aetherlake deploy/control-panel -- env | grep NEXTAUTH_SECRET
  ```
- **Development vs Webpack Mode**:
  If running the dev server locally, always start with `--webpack` as defined in `package.json`:
  ```bash
  cd control-panel
  npm run dev
  ```

---

## 🛠️ Emergency Service Restart Procedures

You can restart misbehaving components without downtime for the rest of the lakehouse:

```bash
# Restart Trino Coordinator & Workers
kubectl rollout restart deployment core-data-stack-trino-coordinator -n aetherlake
kubectl rollout restart deployment core-data-stack-trino-worker -n aetherlake

# Restart Control Panel
kubectl rollout restart deployment control-panel -n aetherlake

# Restart Keycloak SSO
kubectl rollout restart statefulset keycloak -n aetherlake

# Restart Airflow Webserver & Scheduler
kubectl rollout restart deployment core-data-stack-airflow-webserver -n aetherlake
kubectl rollout restart deployment core-data-stack-airflow-scheduler -n aetherlake
```

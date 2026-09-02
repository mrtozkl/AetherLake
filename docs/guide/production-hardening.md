# Production Hardening & Sizing Guide

This guide details best practices, hardware sizing matrices, High Availability (HA) configurations, and disaster recovery procedures for running AetherLake in enterprise production environments.

---

## 📐 Cluster Sizing Matrix

Before provisioning Kubernetes nodes, determine your expected workload profile:

| Profile | Target Workload | Nodes | Minimum Node Specs | Total vCPU / RAM | Recommended Storage |
|---------|-----------------|-------|-------------------|------------------|---------------------|
| **Development / PoC** | Local testing, prototype pipelines | 1 (Single Node) | 8 vCPU, 16 GB RAM | 8 vCPU / 16 GB | 50 GB NVMe / SSD |
| **Medium Production** | Streaming (10k msg/s), BI queries, daily batch | 3–5 Nodes | 8 vCPU, 32 GB RAM | 24–40 vCPU / 96–160 GB | 500 GB–1 TB SSD (GP3) |
| **Enterprise Lakehouse** | 100k+ msg/s, large dbt marts, high-concurrency BI | 6–12+ Nodes | 16 vCPU, 64 GB RAM | 96–192+ vCPU / 384–768+ GB | Multi-TB NVMe / Cloud S3 |

---

## 🏛️ High Availability (HA) Architecture

In default development installations, components run with single replicas to save resources. For production environments, enable multi-replica HA in `helm-charts/core-data-stack/values.yaml`:

### 1. Trino Query Engine
- Run a dedicated coordinator and multiple autoscaled worker pods.
- Enable worker Horizontal Pod Autoscaling (HPA) based on CPU and query memory usage:

```yaml
trino:
  server:
    workers: 4 # Minimum worker baseline
  worker:
    autoscaling:
      enabled: true
      minReplicas: 4
      maxReplicas: 16
      targetCPUUtilizationPercentage: 75
    resources:
      requests:
        cpu: "4"
        memory: "16Gi"
      limits:
        cpu: "8"
        memory: "30Gi"
```

### 2. Apache Kafka (KRaft Node Pool)
- Transition from single-node dual-role to a multi-node KRaft quorum.
- Set minimum replication factor to 3:

```yaml
kafka:
  cluster:
    replicas: 3
    replicationFactor: 3
    storageSize: 200Gi
    storageClassName: "gp3" # or cloud premium SSD
```

### 3. MinIO Object Storage
- In production, switch from single-pod MinIO to a **distributed multi-tenant MinIO pool** (4+ drives across multiple nodes) or native cloud object storage (Amazon S3, Azure Blob, Google Cloud Storage).

---

## 🔒 Security & Production Hardening

### 1. Production TLS with Let's Encrypt / ACME
Replace the self-signed AetherLake root CA with a public trusted Certificate Authority using `cert-manager`:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: security@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod-account-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

Update your Ingress annotations to request certificates automatically:
```yaml
ingress:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - hosts:
        - trino.yourdomain.com
        - minio.yourdomain.com
        - polaris.yourdomain.com
      secretName: aetherlake-production-tls
```

### 2. External Secrets Operator (ESO)
Rather than static secrets generated at install time, connect Kubernetes to enterprise secret vaults (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault, or GCP Secret Manager):

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: aetherlake-credentials
  namespace: aetherlake
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: aetherlake-credentials
  dataFrom:
    - extract:
        key: production/aetherlake/credentials
```

### 3. Kubernetes Network Policies
Restrict East-West inter-pod traffic so only authorized clients can access datastores:
- Allow ingress traffic to Trino (port 8443) only from Control Panel and Ingress Controller.
- Restrict PostgreSQL (port 5432) to Polaris, Airflow, Superset, and Keycloak pods.
- Restrict MinIO (port 9000) to Trino, Polaris, Flink, and Spark pods.

---

## 💾 Backup & Disaster Recovery (DR)

### 1. PostgreSQL Metastore Backups
The metadata for Polaris, Keycloak, Airflow, and Superset lives in PostgreSQL. Implement an automated daily backup using a Kubernetes CronJob:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-metastore-backup
  namespace: aetherlake
spec:
  schedule: "0 2 * * *" # Daily at 02:00 AM UTC
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: pg-dump
              image: postgres:16-alpine
              command:
                - /bin/sh
                - -c
                - |
                  export PGPASSWORD=$POSTGRES_PASSWORD
                  TIMESTAMP=$(date +%Y%m%d_%H%M%S)
                  pg_dumpall -h aetherlake-postgres -U postgres | gzip > /backup/aetherlake_backup_$TIMESTAMP.sql.gz
                  # Sync to remote DR S3 bucket
                  aws s3 cp /backup/aetherlake_backup_$TIMESTAMP.sql.gz s3://your-dr-backup-bucket/postgres/
              volumeMounts:
                - name: backup-vol
                  mountPath: /backup
          restartPolicy: OnFailure
```

### 2. Iceberg Metadata & Table Snapshots
Apache Iceberg provides point-in-time time-travel, but old snapshots must be periodically maintained to prevent metadata bloat:

- Run scheduled dbt or Spark maintenance jobs:
  ```sql
  -- Expire snapshots older than 7 days
  ALTER TABLE iceberg.lakehouse_silver.stg_user_events 
  EXECUTE expire_snapshots(retention_threshold => '7d');

  -- Compact small data files into optimal 128MB Parquet files
  ALTER TABLE iceberg.lakehouse_silver.stg_user_events 
  EXECUTE optimize(file_size_threshold => '128MB');
  ```

### 3. Object Storage Replication
- **MinIO Active-Active Site Replication**: Mirror buckets between primary and secondary datacenter clusters using `mc admin replicate`.
- **Cloud Replication**: In AWS S3 or Azure Blob, enable Cross-Region Replication (CRR) on the lakehouse bucket to protect against regional cloud outages.

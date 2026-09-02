# ☁️ Deploying AetherLake on Google Cloud Platform (GCP)

This guide covers deploying AetherLake in production on **Google Cloud Platform (GCP)** using **Google Kubernetes Engine (GKE)**, **Google Cloud Storage (GCS)**, **Workload Identity Federation**, and **Cloud SQL for PostgreSQL**.

---

## 🏛️ GCP Architecture Overview

```
                                 Cloud DNS + Google-managed SSL (TLS)
                                                  │
                                                  ▼
                                     GCP Cloud Load Balancer (GKE Ingress)
                                                  │
  ┌───────────────────────────────────────────────┼─────────────────────────────────────────────┐
  │ Google Kubernetes Engine (GKE - aetherlake ns)│                                             │
  │                                               ▼                                             │
  │ ┌──────────────────────┐          ┌───────────────────────┐   ┌───────────────────────────┐ │
  │ │ Control Panel UI     │          │ Trino (SQL Engine)    │   │ Apache Polaris            │ │
  │ │ (Next.js 16)         │          │ (GCS/S3 Connector)    │   │ (Iceberg REST Catalog)    │ │
  │ └──────────────────────┘          └───────────┬───────────┘   └─────────────┬─────────────┘ │
  │                                               │                             │               │
  │ ┌──────────────────────┐          ┌───────────▼───────────┐                 │               │
  │ │ Apache Kafka         │          │ Apache Flink          │                 │               │
  │ │ (Strimzi KRaft)      │          │ (GCS Checkpoints)     │                 │               │
  │ └──────────────────────┘          └───────────┬───────────┘                 │               │
  └───────────────────────────────────────────────┼─────────────────────────────┼───────────────┘
                                                  │                             │
                                                  ▼                             ▼
                        ┌─────────────────────────────────────────────────────────────┐
                        │ Google Cloud Storage Lakehouse Bucket (`gs://...`)          │
                        │ - Server-Side Encryption: Cloud KMS (CMEK)                  │
                        │ - Authentication: GCP Workload Identity                     │
                        │ - Iceberg Data & Metadata Parquet Files                     │
                        └─────────────────────────────────────────────────────────────┘
                                                  │
                                                  ▼
                        ┌─────────────────────────────────────────────────────────────┐
                        │ Cloud SQL for PostgreSQL (Polaris & Keycloak Metastores)    │
                        └─────────────────────────────────────────────────────────────┘
```

---

## 🚀 1. GKE Cluster & Workload Identity Setup

### Create a Production GKE Cluster:
```bash
gcloud container clusters create aetherlake-cluster \
  --region=europe-west1 \
  --release-channel=regular \
  --workload-pool=$(gcloud config get-value project).svc.id.goog \
  --enable-ip-alias \
  --enable-shielded-nodes \
  --num-nodes=3 \
  --machine-type=e2-standard-8 \
  --disk-type=pd-ssd \
  --disk-size=100
```

### Connect kubectl to the cluster:
```bash
gcloud container clusters get-credentials aetherlake-cluster --region=europe-west1
```

---

## 🪣 2. Google Cloud Storage (GCS) Lakehouse Bucket

Create a dedicated regional or dual-region storage bucket with versioning and encryption:

```bash
PROJECT_ID=$(gcloud config get-value project)
BUCKET_NAME="aetherlake-lakehouse-${PROJECT_ID}"

# Create GCS Bucket
gcloud storage buckets create gs://${BUCKET_NAME} \
  --location=europe-west1 \
  --uniform-bucket-level-access

# Enable Object Versioning for metadata protection
gcloud storage buckets update gs://${BUCKET_NAME} --versioning
```

### Configure GCS Interoperability / HMAC or Workload Identity:
For S3-compatible access (compatible with MinIO/S3 APIs in Trino, Polaris, and Flink):
```bash
# Generate S3-compatible HMAC credentials for service account
gcloud storage hmac create aetherlake-sa@${PROJECT_ID}.iam.gserviceaccount.com
```

Alternatively, use GCP Workload Identity to bind the Kubernetes ServiceAccount directly:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  aetherlake-sa@${PROJECT_ID}.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:${PROJECT_ID}.svc.id.goog[aetherlake/trino-sa]"
```

---

## 🗄️ 3. Cloud SQL for PostgreSQL (Optional HA Metastore)

For high-availability production metadata:
```bash
gcloud sql instances create aetherlake-postgres \
  --database-version=POSTGRES_16 \
  --tier=db-custom-2-7680 \
  --region=europe-west1 \
  --availability-type=REGIONAL \
  --storage-type=SSD \
  --storage-size=50GB \
  --storage-auto-increase
```

---

## ⚙️ 4. Helm Deployment Overrides (`values-gcp.yaml`)

Create `values-gcp.yaml` to override local MinIO with Google Cloud Storage:

```yaml
# Disable local MinIO tenant (using Google Cloud Storage)
minio:
  enabled: false

# Configure Trino for GCS / S3 Interoperability
trino:
  catalogs:
    iceberg:
      connector.name: iceberg
      iceberg.catalog.type: rest
      iceberg.rest-catalog.uri: http://core-data-stack-polaris:8181/api/catalog
      iceberg.rest-catalog.warehouse: gs://aetherlake-lakehouse/warehouse
      hive.s3.endpoint: https://storage.googleapis.com
      hive.s3.path-style-access: true
      hive.s3.ssl.enabled: true

# Enable GKE Ingress with Google-managed Certificate
ingress:
  enabled: true
  className: "gce"
  annotations:
    kubernetes.io/ingress.class: "gce"
    networking.gke.io/managed-certificates: "aetherlake-managed-cert"
```

### Deploy AetherLake on GKE:
```bash
# 1. Deploy security stack (Keycloak)
helm upgrade --install security-stack helm-charts/security-stack \
  -n aetherlake --create-namespace

# 2. Deploy core data stack with GCP overrides
helm upgrade --install core-data-stack helm-charts/core-data-stack \
  -n aetherlake \
  -f helm-charts/core-data-stack/values.yaml \
  -f values-gcp.yaml
```

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

## 🚀 1. Infrastructure Provisioning via Terraform

AetherLake provides a turnkey Terraform module in [`terraform/gcp`](https://github.com/mrtozkl/AetherLake/tree/main/terraform/gcp) that provisions:
- VPC Network & Subnets with secondary alias IP ranges for GKE pods and services.
- Google Kubernetes Engine (GKE) cluster with Workload Identity Federation enabled.
- Dedicated GKE node pools for system services (Control Panel, Polaris, Kafka) and compute workers (Trino, Flink).
- Google Cloud Storage (GCS) Lakehouse bucket with versioning and lifecycle rules.
- Google Service Accounts (GSAs) with `roles/storage.objectAdmin` and Workload Identity bindings for Trino and Polaris.
- Google Cloud SQL for PostgreSQL 16 instance with private VPC peering.

### Deploy Terraform:

```bash
cd terraform/gcp
terraform init
terraform plan -var="gcp_project_id=YOUR_PROJECT_ID" -out=tfplan
terraform apply tfplan
```

Configure `kubectl` context:
```bash
gcloud container clusters get-credentials aetherlake-gke --region=europe-west1
```

---

## 🛠️ Manual GKE Setup (Alternative to Terraform)

If not using Terraform, you can provision the cluster manually via `gcloud`:

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

AetherLake provides a turnkey production profile in [`helm-charts/core-data-stack/values-gcp.yaml`](https://github.com/mrtozkl/AetherLake/tree/main/helm-charts/core-data-stack/values-gcp.yaml) configured with GCS, GKE Workload Identity, Cloud SQL, and SSD Kafka storage:

```bash
# 1. Deploy security stack (Keycloak SSO)
helm upgrade --install security-stack ./helm-charts/security-stack \
  --namespace aetherlake --create-namespace

# 2. Deploy core data stack with GCP production profile
helm upgrade --install core-data-stack ./helm-charts/core-data-stack \
  -f ./helm-charts/core-data-stack/values-gcp.yaml \
  --namespace aetherlake
```

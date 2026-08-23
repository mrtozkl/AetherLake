# ☁️ Deploying AetherLake on Amazon Web Services (AWS)

This guide covers deploying AetherLake in production on **Amazon Web Services (AWS)** using **Amazon EKS**, **Amazon S3**, **AWS IAM Roles for Service Accounts (IRSA)**, and **Amazon RDS PostgreSQL**.

---

## 🏛️ AWS Architecture Overview

```
                                AWS Route53 + ACM (TLS)
                                           │
                                           ▼
                               AWS ALB Ingress Controller
                                           │
 ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
 │ Amazon EKS Cluster (aetherlake ns)      │                                         │
 │                                         ▼                                         │
 │ ┌───────────────────┐       ┌───────────────────────┐   ┌───────────────────────┐ │
 │ │ Control Panel UI  │       │ Trino (SQL Engine)    │   │ Apache Polaris        │ │
 │ │ (Next.js 16)      │       │ (Native S3 Connector) │   │ (Iceberg REST Catalog)│ │
 │ └───────────────────┘       └───────────┬───────────┘   └───────────┬───────────┘ │
 │                                         │                           │             │
 │ ┌───────────────────┐       ┌───────────▼───────────┐               │             │
 │ │ Apache Kafka      │       │ Apache Flink          │               │             │
 │ │ (Strimzi KRaft)   │       │ (S3 Checkpoints)      │               │             │
 │ └───────────────────┘       └───────────┬───────────┘               │             │
 └─────────────────────────────────────────┼───────────────────────────┼─────────────┘
                                           │                           │
                                           ▼                           ▼
                 ┌───────────────────────────────────────────────────────────┐
                 │ Amazon S3 Lakehouse Bucket (`s3://...`)                   │
                 │ - Server-Side Encryption: AWS KMS                         │
                 │ - Authentication: AWS IAM IRSA (No static credentials)    │
                 │ - Iceberg Data & Metadata Parquet Files                   │
                 └───────────────────────────────────────────────────────────┘
                                           │
                                           ▼
                 ┌───────────────────────────────────────────────────────────┐
                 │ Amazon RDS PostgreSQL Metastore (Polaris / Identity DB)   │
                 └───────────────────────────────────────────────────────────┘
```

---

## 🚀 1. Infrastructure Provisioning via Terraform

AetherLake provides a turnkey Terraform module in [`terraform/aws`](../../terraform/aws/) that provisions:
- Amazon VPC with public, private, and database subnets.
- Amazon EKS cluster with dedicated system and compute node groups.
- Amazon S3 bucket with AWS KMS customer-managed key encryption.
- AWS IAM Roles for Service Accounts (IRSA) for Trino and Polaris.
- Amazon RDS PostgreSQL (v16) for metastore databases.

### Deploy Terraform:

```bash
cd terraform/aws
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Configure your local `kubectl` context:
```bash
aws eks --region eu-central-1 update-kubeconfig --name aetherlake-cloud
```

---

## 📦 2. Deploy AetherLake Helm Chart

Use the pre-configured AWS values profile [`values-aws.yaml`](../../helm-charts/core-data-stack/values-aws.yaml):

```bash
helm upgrade --install core-data-stack ./helm-charts/core-data-stack \
  -f ./helm-charts/core-data-stack/values-aws.yaml \
  --namespace aetherlake --create-namespace \
  --set global.s3.defaultBucket="<YOUR_S3_BUCKET_NAME>" \
  --set global.s3.region="<YOUR_AWS_REGION>" \
  --set trino.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="<TRINO_IRSA_ROLE_ARN>" \
  --set polaris.serviceAccount.annotations."eks\.amazonaws\.com/role-arn"="<POLARIS_IRSA_ROLE_ARN>"
```

---

## 🔐 3. IAM & Security Best Practices

1. **IRSA (IAM Roles for Service Accounts)**:
   - Eliminates hardcoded AWS access keys.
   - Kubernetes pods dynamically assume AWS IAM roles using OIDC federation tokens.
2. **KMS Encryption**:
   - All Iceberg Parquet files and metadata stored in S3 are encrypted at rest with AWS KMS.
3. **Public Access Block**:
   - S3 Lakehouse buckets have `BlockPublicAccess` enabled by default to prevent accidental data leaks.

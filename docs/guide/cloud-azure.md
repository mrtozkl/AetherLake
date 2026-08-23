# ☁️ Deploying AetherLake on Microsoft Azure

This guide covers deploying AetherLake in production on **Microsoft Azure** using **Azure Kubernetes Service (AKS)**, **Azure Data Lake Storage Gen2 (ADLS Gen2)**, **Azure Workload Identity**, and **Azure Database for PostgreSQL Flexible Server**.

---

## 🏛️ Azure Architecture Overview

```
                               Azure DNS + Azure Front Door / App Gateway (TLS)
                                                      │
                                                      ▼
                                       NGINX / AGIC Ingress Controller
                                                      │
 ┌────────────────────────────────────────────────────┼────────────────────────────────────────────────────┐
 │ Azure Kubernetes Service (AKS) (aetherlake ns)     │                                                    │
 │                                                    ▼                                                    │
 │ ┌───────────────────┐                  ┌───────────────────────┐              ┌───────────────────────┐ │
 │ │ Control Panel UI  │                  │ Trino (SQL Engine)    │              │ Apache Polaris        │ │
 │ │ (Next.js 16)      │                  │ (ABFS Native Driver)  │              │ (Iceberg REST Catalog)│ │
 │ └───────────────────┘                  └───────────┬───────────┘              └───────────┬───────────┘ │
 │                                                    │                                      │             │
 │ ┌───────────────────┐                  ┌───────────▼───────────┐                          │             │
 │ │ Apache Kafka      │                  │ Apache Flink          │                          │             │
 │ │ (Strimzi KRaft)   │                  │ (ADLS Gen2 Checkpoint)│                          │             │
 │ └───────────────────┘                  └───────────┬───────────┘                          │             │
 └────────────────────────────────────────────────────┼──────────────────────────────────────┼─────────────┘
                                                      │                                      │
                                                      ▼                                      ▼
                 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
                 │ Azure Data Lake Storage Gen2 (ADLS Gen2) (`abfs://...`)                                 │
                 │ - Hierarchical Namespace (HNS) Enabled                                                  │
                 │ - Authentication: Azure Workload Identity (Federated Credentials)                       │
                 │ - Iceberg Parquet Tables & Catalog Metadata                                             │
                 └─────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
                 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
                 │ Azure Database for PostgreSQL Flexible Server (Metastore)                               │
                 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 1. Infrastructure Provisioning via Terraform

AetherLake provides a turnkey Terraform module in [`terraform/azure`](../../terraform/azure/) that provisions:
- Azure Virtual Network & dedicated delegated subnets.
- Azure Kubernetes Service (AKS) with OIDC issuer and Workload Identity enabled.
- ADLS Gen2 Storage Account with Hierarchical Namespace (HNS) and lakehouse filesystem.
- User-Assigned Managed Identity and Federated Identity Credentials.
- Azure Database for PostgreSQL Flexible Server.

### Deploy Terraform:

```bash
cd terraform/azure
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Configure your local `kubectl` context:
```bash
az aks get-credentials --resource-group aetherlake-aks-rg --name aetherlake-aks
```

---

## 📦 2. Deploy AetherLake Helm Chart

Use the pre-configured Azure values profile [`values-azure.yaml`](../../helm-charts/core-data-stack/values-azure.yaml):

```bash
helm upgrade --install core-data-stack ./helm-charts/core-data-stack \
  -f ./helm-charts/core-data-stack/values-azure.yaml \
  --namespace aetherlake --create-namespace \
  --set global.azure.storageAccount="<YOUR_ADLS_ACCOUNT>" \
  --set global.azure.container="lakehouse" \
  --set trino.serviceAccount.annotations."azure\.workload\.identity/client-id"="<WORKLOAD_ID_CLIENT_ID>" \
  --set polaris.serviceAccount.annotations."azure\.workload\.identity/client-id"="<WORKLOAD_ID_CLIENT_ID>"
```

---

## 🔐 3. Azure Workload Identity Security

- **Passwordless Authentication**: Pods use short-lived tokens federated with Microsoft Entra ID (Azure AD).
- **Storage Blob Data Contributor**: Role-based access control assigned only to the specific Managed Identity.

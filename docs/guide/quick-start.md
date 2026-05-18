# Quick Start

Get your AetherLake instance up and running locally in minutes.

## Prerequisites

- Kubernetes cluster (v1.26+) — local: [Docker Desktop](https://www.docker.com/products/docker-desktop/), [minikube](https://minikube.sigs.k8s.io/), or [kind](https://kind.sigs.k8s.io/)
- [Helm](https://helm.sh/) v3.12+
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- NGINX Ingress Controller

## Step-by-Step Installation

### 1. Clone the repository

```bash
git clone https://github.com/mrtozkl/AetherLake.git
cd AetherLake
```

### 2. Create namespace

```bash
kubectl create namespace aetherlake
```

### 3. Deploy the Security Stack (Keycloak)

```bash
cd helm-charts/security-stack
helm dependency update
helm install security-stack . -n aetherlake
```

### 4. Deploy the Core Data Stack

```bash
cd helm-charts/core-data-stack
helm dependency update
helm install core-data-stack . -n aetherlake
```

### 5. Apply Ingress rules

```bash
kubectl apply -f aetherlake-ingress.yaml
```

### 6. Configure local DNS

Add the following to your `/etc/hosts` (or use a local DNS resolver):

```text
127.0.0.1  minio.aetherlake.local
127.0.0.1  trino.aetherlake.local
127.0.0.1  polaris.aetherlake.local
127.0.0.1  keycloak.aetherlake.local
127.0.0.1  airflow.aetherlake.local
127.0.0.1  milvus.aetherlake.local
```

### 7. Access the platform

| Service | URL |
|---------|-----|
| Control Panel | `http://localhost:3000` |
| MinIO Console | `http://minio.aetherlake.local` |
| Trino | `http://trino.aetherlake.local` |
| Polaris | `http://polaris.aetherlake.local` |
| Keycloak | `http://keycloak.aetherlake.local` |
| Airflow | `http://airflow.aetherlake.local` |
| Milvus (Attu) | `http://milvus.aetherlake.local` |

**Default credentials:** `admin` / `admin`

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.20"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.20"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

provider "google-beta" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# ---------------------------------------------------------------------------------------------------------------------
# 1. VPC & Networking (VPC-Native Subnet for GKE Alias IPs)
# ---------------------------------------------------------------------------------------------------------------------
resource "google_compute_network" "lakehouse_vpc" {
  name                    = "${var.cluster_name}-vpc"
  auto_create_subnetworks = false
  description             = "VPC network for AetherLake GKE cluster and Cloud SQL"
}

resource "google_compute_subnetwork" "lakehouse_subnet" {
  name                     = "${var.cluster_name}-subnet"
  ip_cidr_range            = var.network_cidr
  region                   = var.gcp_region
  network                  = google_compute_network.lakehouse_vpc.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "gke-pods"
    ip_cidr_range = var.pods_cidr
  }

  secondary_ip_range {
    range_name    = "gke-services"
    ip_cidr_range = var.services_cidr
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 2. Private Service Access for Google Cloud SQL (VPC Peering)
# ---------------------------------------------------------------------------------------------------------------------
resource "google_compute_global_address" "private_ip_address" {
  name          = "${var.cluster_name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.lakehouse_vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.lakehouse_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# ---------------------------------------------------------------------------------------------------------------------
# 3. Google Kubernetes Engine (GKE) Cluster with Workload Identity
# ---------------------------------------------------------------------------------------------------------------------
resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.gcp_region

  # Separate node pools are managed explicitly below
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.lakehouse_vpc.name
  subnetwork = google_compute_subnetwork.lakehouse_subnet.name

  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-pods"
    services_secondary_range_name = "gke-services"
  }

  workload_identity_config {
    workload_pool = "${var.gcp_project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  min_master_version = var.kubernetes_version

  resource_labels = var.labels
}

# System Node Pool: Control Panel, Polaris, Keycloak, Kafka, Superset, Airflow
resource "google_container_node_pool" "system_nodes" {
  name       = "system-node-pool"
  location   = var.gcp_region
  cluster    = google_container_cluster.primary.name
  node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 6
  }

  node_config {
    machine_type = var.system_node_machine_type
    disk_size_gb = 100
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    labels = merge(var.labels, {
      "role" = "system"
    })
  }
}

# Compute Node Pool: Heavy analytical workloads (Trino Workers, Flink Tasks)
resource "google_container_node_pool" "compute_nodes" {
  name       = "compute-node-pool"
  location   = var.gcp_region
  cluster    = google_container_cluster.primary.name
  node_count = 2

  autoscaling {
    min_node_count = 2
    max_node_count = 10
  }

  node_config {
    machine_type = var.compute_node_machine_type
    disk_size_gb = 200
    disk_type    = "pd-ssd"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    labels = merge(var.labels, {
      "role" = "compute"
    })
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 4. Google Cloud Storage (GCS) Lakehouse Bucket
# ---------------------------------------------------------------------------------------------------------------------
resource "google_storage_bucket" "lakehouse" {
  name                        = "${var.cluster_name}-lakehouse-${var.gcp_project_id}"
  location                    = var.gcp_region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      num_newer_versions = 5
      with_state         = "ARCHIVED"
    }
  }

  labels = var.labels
}

# ---------------------------------------------------------------------------------------------------------------------
# 5. Workload Identity: Service Accounts & IAM Roles for Trino & Polaris
# ---------------------------------------------------------------------------------------------------------------------
# Google Service Account for Trino
resource "google_service_account" "trino" {
  account_id   = "${var.cluster_name}-trino"
  display_name = "AetherLake Trino Service Account"
}

# Google Service Account for Polaris
resource "google_service_account" "polaris" {
  account_id   = "${var.cluster_name}-polaris"
  display_name = "AetherLake Polaris Service Account"
}

# Grant Storage Object Admin on the Lakehouse bucket
resource "google_storage_bucket_iam_member" "trino_storage" {
  bucket = google_storage_bucket.lakehouse.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.trino.email}"
}

resource "google_storage_bucket_iam_member" "polaris_storage" {
  bucket = google_storage_bucket.lakehouse.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.polaris.email}"
}

# Allow Kubernetes Service Accounts (KSA) in the "aetherlake" namespace to impersonate the GSAs
resource "google_service_account_iam_member" "trino_workload_identity" {
  service_account_id = google_service_account.trino.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project_id}.svc.id.goog[aetherlake/core-data-stack-trino]"
}

resource "google_service_account_iam_member" "polaris_workload_identity" {
  service_account_id = google_service_account.polaris.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.gcp_project_id}.svc.id.goog[aetherlake/core-data-stack-polaris]"
}

# ---------------------------------------------------------------------------------------------------------------------
# 6. Google Cloud SQL for PostgreSQL (Metastores)
# ---------------------------------------------------------------------------------------------------------------------
resource "random_password" "cloudsql_password" {
  length  = 24
  special = false
}

resource "google_sql_database_instance" "metastore" {
  name             = "${var.cluster_name}-pg"
  database_version = "POSTGRES_16"
  region           = var.gcp_region

  depends_on = [google_service_networking_connection.private_vpc_connection]

  settings {
    tier              = var.cloudsql_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_size         = 50
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.lakehouse_vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "02:00"
    }

    user_labels = var.labels
  }

  deletion_protection = var.environment == "production"
}

resource "google_sql_database" "aetherlake" {
  name     = "aetherlake"
  instance = google_sql_database_instance.metastore.name
}

resource "google_sql_user" "aetheradmin" {
  name     = "aetheradmin"
  instance = google_sql_database_instance.metastore.name
  password = random_password.cloudsql_password.result
}

variable "gcp_project_id" {
  description = "The Google Cloud Platform (GCP) Project ID."
  type        = string
}

variable "gcp_region" {
  description = "The GCP Region where resources will be provisioned."
  type        = string
  default     = "europe-west1"
}

variable "cluster_name" {
  description = "Unique resource prefix for AetherLake GKE cluster and associated resources."
  type        = string
  default     = "aetherlake-gke"
}

variable "environment" {
  description = "Deployment environment (e.g. development, staging, production)."
  type        = string
  default     = "production"
}

variable "network_cidr" {
  description = "Primary CIDR block for the VPC subnet."
  type        = string
  default     = "10.20.0.0/16"
}

variable "pods_cidr" {
  description = "Secondary CIDR block for GKE Pods (alias IP ranges)."
  type        = string
  default     = "10.24.0.0/14"
}

variable "services_cidr" {
  description = "Secondary CIDR block for GKE Services."
  type        = string
  default     = "10.28.0.0/20"
}

variable "kubernetes_version" {
  description = "GKE control plane and node pool release version."
  type        = string
  default     = "1.29"
}

variable "system_node_machine_type" {
  description = "Machine type for the GKE system node pool (Control Panel, Polaris, Keycloak, Kafka)."
  type        = string
  default     = "e2-standard-4"
}

variable "compute_node_machine_type" {
  description = "Machine type for the heavy compute GKE node pool (Trino workers, Flink task managers)."
  type        = string
  default     = "e2-standard-8"
}

variable "cloudsql_tier" {
  description = "Machine tier for Google Cloud SQL for PostgreSQL metastore instance."
  type        = string
  default     = "db-custom-2-7680"
}

variable "labels" {
  description = "Resource labels applied to all GCP resources."
  type        = map(string)
  default = {
    "project"    = "aetherlake"
    "managed-by" = "terraform"
    "platform"   = "datalakehouse"
  }
}

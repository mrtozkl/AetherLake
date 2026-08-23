variable "aws_region" {
  description = "The AWS Region where resources will be provisioned."
  type        = string
  default     = "eu-central-1"
}

variable "cluster_name" {
  description = "Unique name for the AetherLake cluster and associated resources."
  type        = string
  default     = "aetherlake-cloud"
}

variable "environment" {
  description = "Deployment environment (e.g. development, staging, production)."
  type        = string
  default     = "production"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "kubernetes_version" {
  description = "Kubernetes control plane version for EKS."
  type        = string
  default     = "1.29"
}

variable "system_node_instance_types" {
  description = "EC2 instance types for the system services node group (Control Panel, Polaris, Keycloak, Kafka)."
  type        = list(string)
  default     = ["m6i.xlarge", "m5.xlarge"]
}

variable "compute_node_instance_types" {
  description = "EC2 instance types for the heavy compute node group (Trino workers, Flink task managers, Spark)."
  type        = list(string)
  default     = ["r6i.2xlarge", "m6i.2xlarge"]
}

variable "rds_instance_class" {
  description = "Database instance type for Amazon RDS PostgreSQL."
  type        = string
  default     = "db.t4g.medium"
}

variable "tags" {
  description = "Resource tags applied to all AWS resources."
  type        = map(string)
  default = {
    "Project"    = "AetherLake"
    "ManagedBy"  = "Terraform"
    "Platform"   = "DataLakehouse"
  }
}

variable "azure_region" {
  description = "Azure Region for AetherLake deployment."
  type        = string
  default     = "westeurope"
}

variable "cluster_name" {
  description = "Unique resource prefix for AetherLake AKS cluster."
  type        = string
  default     = "aetherlake-aks"
}

variable "vnet_cidr" {
  description = "CIDR block for the Azure Virtual Network."
  type        = string
  default     = "10.10.0.0/16"
}

variable "kubernetes_version" {
  description = "AKS Kubernetes version."
  type        = string
  default     = "1.29"
}

variable "system_node_count" {
  description = "Number of system nodes for AKS default node pool."
  type        = number
  default     = 3
}

variable "system_node_vm_size" {
  description = "VM size for AKS system node pool."
  type        = string
  default     = "Standard_D4s_v5"
}

variable "compute_node_vm_size" {
  description = "VM size for AKS compute node pool (Trino, Flink)."
  type        = string
  default     = "Standard_E8s_v5"
}

variable "db_sku_name" {
  description = "SKU Name for Azure PostgreSQL Flexible Server."
  type        = string
  default     = "GP_Standard_D2ds_v5"
}

variable "tags" {
  description = "Tags applied to all Azure resources."
  type        = map(string)
  default = {
    "Project"    = "AetherLake"
    "ManagedBy"  = "Terraform"
    "Platform"   = "DataLakehouse"
  }
}

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.96"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 2.47"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.26"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 1. Resource Group
# ---------------------------------------------------------------------------------------------------------------------
resource "azurerm_resource_group" "rg" {
  name     = "${var.cluster_name}-rg"
  location = var.azure_region
  tags     = var.tags
}

# ---------------------------------------------------------------------------------------------------------------------
# 2. Virtual Network & Subnets
# ---------------------------------------------------------------------------------------------------------------------
resource "azurerm_virtual_network" "vnet" {
  name                = "${var.cluster_name}-vnet"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = [var.vnet_cidr]
  tags                = var.tags
}

resource "azurerm_subnet" "aks_subnet" {
  name                 = "aks-nodes-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, 1)]
}

resource "azurerm_subnet" "db_subnet" {
  name                 = "postgresql-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, 2)]
  service_endpoints    = ["Microsoft.Storage"]

  delegation {
    name = "fs-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 3. Azure Data Lake Storage Gen2 (ADLS Gen2)
# ---------------------------------------------------------------------------------------------------------------------
resource "random_string" "storage_suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_storage_account" "lakehouse" {
  name                     = "aetherlake${random_string.storage_suffix.result}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "ZRS"
  account_kind             = "StorageV2"
  is_hns_enabled           = true # Enable Hierarchical Namespace for ADLS Gen2

  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false

  tags = var.tags
}

resource "azurerm_storage_data_lake_gen2_filesystem" "lakehouse_container" {
  name               = "lakehouse"
  storage_account_id = azurerm_storage_account.lakehouse.id
}

# ---------------------------------------------------------------------------------------------------------------------
# 4. Azure Managed Identity & Workload Identity
# ---------------------------------------------------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "lakehouse_identity" {
  name                = "${var.cluster_name}-workload-id"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  tags                = var.tags
}

# Assign Storage Blob Data Contributor to Managed Identity
resource "azurerm_role_assignment" "storage_contributor" {
  scope                = azurerm_storage_account.lakehouse.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.lakehouse_identity.principal_id
}

# ---------------------------------------------------------------------------------------------------------------------
# 5. Azure Kubernetes Service (AKS)
# ---------------------------------------------------------------------------------------------------------------------
resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.cluster_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = var.cluster_name
  kubernetes_version  = var.kubernetes_version

  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  default_node_pool {
    name           = "system"
    node_count     = var.system_node_count
    vm_size        = var.system_node_vm_size
    vnet_subnet_id = azurerm_subnet.aks_subnet.id
    os_disk_size_gb = 100
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  tags = var.tags
}

# High-Performance Compute Node Pool for Trino & Flink
resource "azurerm_kubernetes_cluster_node_pool" "compute" {
  name                  = "compute"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.aks.id
  vm_size               = var.compute_node_vm_size
  node_count            = 2
  min_count             = 1
  max_count             = 10
  enable_auto_scaling   = true
  vnet_subnet_id        = azurerm_subnet.aks_subnet.id

  node_labels = {
    "role" = "data-plane"
  }

  tags = var.tags
}

# Federated Identity Credential for Trino & Polaris ServiceAccounts
resource "azurerm_federated_identity_credential" "trino_federation" {
  name                = "${var.cluster_name}-trino-fed"
  resource_group_name = azurerm_resource_group.rg.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  parent_id           = azurerm_user_assigned_identity.lakehouse_identity.id
  subject             = "system:serviceaccount:aetherlake:core-data-stack-trino"
}

resource "azurerm_federated_identity_credential" "trino_direct_federation" {
  name                = "${var.cluster_name}-trino-direct-fed"
  resource_group_name = azurerm_resource_group.rg.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  parent_id           = azurerm_user_assigned_identity.lakehouse_identity.id
  subject             = "system:serviceaccount:aetherlake:trino"
}

resource "azurerm_federated_identity_credential" "polaris_federation" {
  name                = "${var.cluster_name}-polaris-fed"
  resource_group_name = azurerm_resource_group.rg.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  parent_id           = azurerm_user_assigned_identity.lakehouse_identity.id
  subject             = "system:serviceaccount:aetherlake:core-data-stack-polaris"
}

resource "azurerm_federated_identity_credential" "polaris_direct_federation" {
  name                = "${var.cluster_name}-polaris-direct-fed"
  resource_group_name = azurerm_resource_group.rg.name
  audience            = ["api://AzureADTokenExchange"]
  issuer              = azurerm_kubernetes_cluster.aks.oidc_issuer_url
  parent_id           = azurerm_user_assigned_identity.lakehouse_identity.id
  subject             = "system:serviceaccount:aetherlake:polaris"
}

# ---------------------------------------------------------------------------------------------------------------------
# 6. Azure Database for PostgreSQL Flexible Server (Metastore)
# ---------------------------------------------------------------------------------------------------------------------
resource "random_password" "pg_password" {
  length  = 24
  special = false
}

resource "azurerm_private_dns_zone" "postgres_dns" {
  name                = "${var.cluster_name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.rg.name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres_dns_link" {
  name                  = "${var.cluster_name}-pg-dns-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgres_dns.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
  resource_group_name   = azurerm_resource_group.rg.name
  tags                  = var.tags
}

resource "azurerm_postgresql_flexible_server" "metastore" {
  name                   = "${var.cluster_name}-metastore-pg"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "16"
  delegated_subnet_id    = azurerm_subnet.db_subnet.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres_dns.id
  administrator_login    = "aetheradmin"
  administrator_password = random_password.pg_password.result
  zone                   = "1"

  storage_mb = 32768
  sku_name   = var.db_sku_name

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres_dns_link]

  tags = var.tags
}

resource "azurerm_postgresql_flexible_server_database" "aetherlake_db" {
  name      = "aetherlake"
  server_id = azurerm_postgresql_flexible_server.metastore.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

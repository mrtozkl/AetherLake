output "resource_group_name" {
  description = "Resource Group Name"
  value       = azurerm_resource_group.rg.name
}

output "aks_cluster_name" {
  description = "AKS Cluster Name"
  value       = azurerm_kubernetes_cluster.aks.name
}

output "storage_account_name" {
  description = "ADLS Gen2 Storage Account Name"
  value       = azurerm_storage_account.lakehouse.name
}

output "adls_container_name" {
  description = "ADLS Gen2 Container Name"
  value       = azurerm_storage_data_lake_gen2_filesystem.lakehouse_container.name
}

output "workload_identity_client_id" {
  description = "User Assigned Managed Identity Client ID for Workload Identity"
  value       = azurerm_user_assigned_identity.lakehouse_identity.client_id
}

output "postgresql_fqdn" {
  description = "Azure PostgreSQL Flexible Server FQDN"
  value       = azurerm_postgresql_flexible_server.metastore.fqdn
}

output "postgresql_admin_username" {
  description = "PostgreSQL Administrator Login"
  value       = azurerm_postgresql_flexible_server.metastore.administrator_login
}

output "postgresql_admin_password" {
  description = "PostgreSQL Administrator Password"
  value       = random_password.pg_password.result
  sensitive   = true
}

output "helm_values_snippet" {
  description = "Ready-to-use Helm values snippet for Azure AKS deployment"
  value       = <<-EOT
    global:
      cloudProvider: "azure"
      azure:
        storageAccount: "${azurerm_storage_account.lakehouse.name}"
        container: "${azurerm_storage_data_lake_gen2_filesystem.lakehouse_container.name}"
        clientId: "${azurerm_user_assigned_identity.lakehouse_identity.client_id}"
    trino:
      serviceAccount:
        annotations:
          azure.workload.identity/client-id: "${azurerm_user_assigned_identity.lakehouse_identity.client_id}"
    polaris:
      serviceAccount:
        annotations:
          azure.workload.identity/client-id: "${azurerm_user_assigned_identity.lakehouse_identity.client_id}"
  EOT
}

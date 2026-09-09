output "cluster_name" {
  description = "GKE Cluster Name"
  value       = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  description = "GKE Cluster API Endpoint"
  value       = google_container_cluster.primary.endpoint
}

output "gcs_bucket_name" {
  description = "GCS Lakehouse Bucket Name"
  value       = google_storage_bucket.lakehouse.name
}

output "gcs_bucket_url" {
  description = "GCS Lakehouse Bucket URL (gs://...)"
  value       = "gs://${google_storage_bucket.lakehouse.name}"
}

output "trino_gsa_email" {
  description = "Google Service Account email for Trino"
  value       = google_service_account.trino.email
}

output "polaris_gsa_email" {
  description = "Google Service Account email for Polaris"
  value       = google_service_account.polaris.email
}

output "cloudsql_connection_name" {
  description = "Google Cloud SQL Connection Name"
  value       = google_sql_database_instance.metastore.connection_name
}

output "cloudsql_private_ip" {
  description = "Google Cloud SQL Private IP Address"
  value       = google_sql_database_instance.metastore.private_ip_address
}

output "cloudsql_db_name" {
  description = "Google Cloud SQL Database Name"
  value       = google_sql_database.aetherlake.name
}

output "cloudsql_username" {
  description = "Google Cloud SQL Master Username"
  value       = google_sql_user.aetheradmin.name
}

output "cloudsql_password" {
  description = "Google Cloud SQL Master Password"
  value       = random_password.cloudsql_password.result
  sensitive   = true
}

output "helm_values_snippet" {
  description = "Ready-to-use Helm values snippet for GCP GKE deployment"
  value       = <<-EOT
    global:
      cloudProvider: "gcp"
      gcp:
        project: "${var.gcp_project_id}"
        bucket: "${google_storage_bucket.lakehouse.name}"
    trino:
      serviceAccount:
        annotations:
          iam.gke.io/gcp-service-account: "${google_service_account.trino.email}"
    polaris:
      serviceAccount:
        annotations:
          iam.gke.io/gcp-service-account: "${google_service_account.polaris.email}"
    externalPostgresql:
      host: "${google_sql_database_instance.metastore.private_ip_address}"
  EOT
}

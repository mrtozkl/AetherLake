output "cluster_name" {
  description = "EKS Cluster Name"
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS Cluster API Endpoint"
  value       = module.eks.cluster_endpoint
}

output "s3_bucket_name" {
  description = "S3 Lakehouse Bucket Name"
  value       = aws_s3_bucket.lakehouse.id
}

output "s3_bucket_arn" {
  description = "S3 Lakehouse Bucket ARN"
  value       = aws_s3_bucket.lakehouse.arn
}

output "trino_irsa_role_arn" {
  description = "IAM Role ARN for Trino IRSA"
  value       = module.trino_irsa.iam_role_arn
}

output "polaris_irsa_role_arn" {
  description = "IAM Role ARN for Polaris IRSA"
  value       = module.polaris_irsa.iam_role_arn
}

output "rds_endpoint" {
  description = "RDS PostgreSQL Database Endpoint"
  value       = aws_db_instance.metastore.endpoint
}

output "rds_db_name" {
  description = "RDS Database Name"
  value       = aws_db_instance.metastore.db_name
}

output "rds_username" {
  description = "RDS Master Username"
  value       = aws_db_instance.metastore.username
}

output "rds_password" {
  description = "RDS Master Password"
  value       = random_password.rds_password.result
  sensitive   = true
}

output "helm_values_snippet" {
  description = "Ready-to-use Helm values snippet for AWS EKS deployment"
  value       = <<-EOT
    global:
      cloudProvider: "aws"
      s3:
        endpoint: "https://s3.${var.aws_region}.amazonaws.com"
        defaultBucket: "${aws_s3_bucket.lakehouse.id}"
        region: "${var.aws_region}"
    trino:
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: "${module.trino_irsa.iam_role_arn}"
    polaris:
      serviceAccount:
        annotations:
          eks.amazonaws.com/role-arn: "${module.polaris_irsa.iam_role_arn}"
  EOT
}

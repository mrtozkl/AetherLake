terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.26"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# ---------------------------------------------------------------------------------------------------------------------
# 1. VPC & Networking
# ---------------------------------------------------------------------------------------------------------------------
data "aws_availability_zones" "available" {}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.5"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs              = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets  = [for i in [1, 2, 3] : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets   = [for i in [4, 5, 6] : cidrsubnet(var.vpc_cidr, 4, i)]
  database_subnets = [for i in [7, 8, 9] : cidrsubnet(var.vpc_cidr, 4, i)]

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true

  public_subnet_tags = {
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------------------------------------------------
# 2. KMS Encryption Key for S3 Lakehouse & RDS
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_kms_key" "lakehouse_key" {
  description             = "AetherLake Lakehouse KMS Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-lakehouse-kms"
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# 3. Amazon S3 Lakehouse Buckets
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_s3_bucket" "lakehouse" {
  bucket        = "${var.cluster_name}-lakehouse-${var.aws_region}"
  force_destroy = var.environment != "production"

  tags = merge(var.tags, {
    Name = "AetherLake Iceberg Storage"
  })
}

resource "aws_s3_bucket_versioning" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.lakehouse_key.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "lakehouse" {
  bucket = aws_s3_bucket.lakehouse.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------------------------------------------------
# 4. Amazon EKS Cluster
# ---------------------------------------------------------------------------------------------------------------------
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.8"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  cluster_endpoint_public_access = true

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    # General & Control Services Node Group
    system = {
      name           = "system-nodes"
      instance_types = var.system_node_instance_types
      min_size       = 2
      max_size       = 5
      desired_size   = 3

      labels = {
        "role" = "system"
      }
    }

    # High-Performance Data Processing (Trino / Flink / Spark)
    compute = {
      name           = "compute-nodes"
      instance_types = var.compute_node_instance_types
      min_size       = 1
      max_size       = 10
      desired_size   = 2

      labels = {
        "role" = "data-plane"
      }
    }
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------------------------------------------------
# 5. IAM Roles for Service Accounts (IRSA)
# ---------------------------------------------------------------------------------------------------------------------
# S3 Access Policy for Lakehouse Engines
resource "aws_iam_policy" "lakehouse_s3_access" {
  name        = "${var.cluster_name}-s3-lakehouse-policy"
  description = "Allows Trino, Polaris, Flink and Spark to read/write Iceberg tables in S3"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
          "s3:ListBucketMultipartUploads"
        ]
        Resource = [aws_s3_bucket.lakehouse.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts"
        ]
        Resource = ["${aws_s3_bucket.lakehouse.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = [aws_kms_key.lakehouse_key.arn]
      }
    ]
  })
}

# ---------------------------------------------------------------------------------------------------------------------
# 5. AWS EBS CSI Driver (Enables gp3 dynamic storage provisioning for Kafka/StatefulSets)
# ---------------------------------------------------------------------------------------------------------------------
module "ebs_csi_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name             = "${var.cluster_name}-ebs-csi-role"
  attach_ebs_csi_policy = true

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["kube-system:ebs-csi-controller-sa"]
    }
  }
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = module.eks.cluster_name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = module.ebs_csi_irsa.iam_role_arn

  tags = var.tags
}

# ---------------------------------------------------------------------------------------------------------------------
# 6. IAM Roles for Service Accounts (IRSA) for Lakehouse Engines
# ---------------------------------------------------------------------------------------------------------------------
# IRSA for Trino Coordinator & Workers
module "trino_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name = "${var.cluster_name}-trino-s3-role"

  role_policy_arns = {
    policy = aws_iam_policy.lakehouse_s3_access.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = [
        "aetherlake:core-data-stack-trino",
        "aetherlake:trino",
        "aetherlake:flink",
        "aetherlake:spark",
        "aetherlake:default"
      ]
    }
  }
}

# IRSA for Apache Polaris Iceberg REST Catalog
module "polaris_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.34"

  role_name = "${var.cluster_name}-polaris-s3-role"

  role_policy_arns = {
    policy = aws_iam_policy.lakehouse_s3_access.arn
  }

  oidc_providers = {
    main = {
      provider_arn = module.eks.oidc_provider_arn
      namespace_service_accounts = [
        "aetherlake:core-data-stack-polaris",
        "aetherlake:polaris"
      ]
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 6. Amazon RDS PostgreSQL Metastore (Polaris, Keycloak, Superset, Airflow)
# ---------------------------------------------------------------------------------------------------------------------
resource "aws_security_group" "rds_sg" {
  name        = "${var.cluster_name}-rds-sg"
  description = "Allow inbound postgres traffic from EKS nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "random_password" "rds_password" {
  length  = 24
  special = false
}

resource "aws_db_subnet_group" "db_subnet" {
  name       = "${var.cluster_name}-db-subnet-group"
  subnet_ids = module.vpc.database_subnets

  tags = var.tags
}

resource "aws_db_instance" "metastore" {
  identifier            = "${var.cluster_name}-metastore"
  engine                = "postgres"
  engine_version        = "16.2"
  instance_class        = var.rds_instance_class
  allocated_storage     = 50
  max_allocated_storage = 200

  db_name  = "aetherlake"
  username = "aetheradmin"
  password = random_password.rds_password.result

  db_subnet_group_name   = aws_db_subnet_group.db_subnet.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]
  skip_final_snapshot    = var.environment != "production"
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.lakehouse_key.arn

  tags = var.tags
}

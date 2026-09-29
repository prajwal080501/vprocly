# vprocly-media (existing, reused for S3_BUCKET_DOCUMENTS) is NOT managed here -- it predates this Terraform
# and is referenced by ARN only (iam.tf), so `terraform destroy` can never touch it.

resource "aws_s3_bucket" "quarantine" {
  bucket = "vprocly-quarantine-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "quarantine" {
  bucket                  = aws_s3_bucket.quarantine.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_ecr_repository" "api" {
  name                 = "vprocly/api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "worker" {
  name                 = "vprocly/worker"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "excel" {
  name                 = "vprocly/excel"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "web" {
  name                 = "vprocly/web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

# Keep only the last 5 images per repo -- pilot-scale, no need for a deep history.
locals {
  ecr_keep_last_5 = jsonencode({
    rules = [{
      rulePriority = 1
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy     = local.ecr_keep_last_5
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name
  policy     = local.ecr_keep_last_5
}

resource "aws_ecr_lifecycle_policy" "excel" {
  repository = aws_ecr_repository.excel.name
  policy     = local.ecr_keep_last_5
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name
  policy     = local.ecr_keep_last_5
}

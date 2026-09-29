data "aws_caller_identity" "current" {}

# --- EC2 instance role: SSM Session Manager (no SSH needed), read this app's SSM parameters, pull from ECR.
resource "aws_iam_role" "app_instance" {
  name = "vprocly-pilot-app-instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.app_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy" "read_params" {
  name = "read-vprocly-params"
  role = aws_iam_role.app_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
      Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/vprocly/prod/*"
    }]
  })
}

resource "aws_iam_role_policy" "ecr_pull" {
  name = "pull-vprocly-ecr"
  role = aws_iam_role.app_instance.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = [
          aws_ecr_repository.api.arn,
          aws_ecr_repository.worker.arn,
          aws_ecr_repository.excel.arn,
          aws_ecr_repository.web.arn,
        ]
      },
    ]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "vprocly-pilot-app"
  role = aws_iam_role.app_instance.name
}

# --- Dedicated IAM user for the app's own S3 access (config.ts requires static S3_ACCESS_KEY/SECRET_KEY;
# scoped to just the two buckets this app uses, nothing else in the account).
resource "aws_iam_user" "app_s3" {
  name = "vprocly-pilot-app-s3"
}

resource "aws_iam_access_key" "app_s3" {
  user = aws_iam_user.app_s3.name
}

resource "aws_iam_user_policy" "app_s3" {
  name = "vprocly-pilot-s3-scoped"
  user = aws_iam_user.app_s3.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
      Resource = [
        "arn:aws:s3:::vprocly-media",
        "arn:aws:s3:::vprocly-media/*",
        aws_s3_bucket.quarantine.arn,
        "${aws_s3_bucket.quarantine.arn}/*",
      ]
    }]
  })
}

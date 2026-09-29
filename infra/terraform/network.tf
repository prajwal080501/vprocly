# Reuses the account's existing default VPC (already has 3 public subnets, one per AZ) -- no new
# VPC/subnets/IGW needed for a single-host pilot, keeping this contained and free of NAT costs.
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_subnet" "app" {
  id = data.aws_subnets.default.ids[0]
}

data "aws_subnet" "db_secondary" {
  id = data.aws_subnets.default.ids[1]
}

resource "aws_db_subnet_group" "vprocly" {
  name       = "vprocly-pilot"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "app" {
  name        = "vprocly-pilot-app"
  description = "Pilot backend host: Caddy (80/443) public, SSH restricted or SSM-only."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP (ACME challenge + redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.ssh_cidr != "" ? [var.ssh_cidr] : []
    content {
      description = "SSH (only if ssh_cidr is set -- SSM Session Manager is the default access path)"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vprocly-pilot-app" }
}

resource "aws_security_group" "db" {
  name        = "vprocly-pilot-db"
  description = "RDS: reachable only from the app host."
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Postgres from the app host"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "vprocly-pilot-db" }
}

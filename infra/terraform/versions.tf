terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "vprocly-terraform-state-319125697352"
    key            = "pilot/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "vprocly-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

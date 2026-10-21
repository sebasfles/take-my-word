terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  backend "s3" {
    bucket       = "takemyword-terraform-state-115891590483"
    key          = "prd/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true

    allowed_account_ids = ["115891590483"]
  }
}

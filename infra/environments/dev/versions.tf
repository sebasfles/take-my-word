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
    encrypt      = true
    use_lockfile = true
  }
}

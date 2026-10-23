terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"

      configuration_aliases = [aws.us_east_1]
    }
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }
}

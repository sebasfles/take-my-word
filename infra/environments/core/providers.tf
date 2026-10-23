provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}

provider "github" {
  owner = var.github.owner

  app_auth {
    id              = var.github.app_id
    installation_id = var.github.app_installation_id
    pem_file        = var.github_app_pem
  }
}

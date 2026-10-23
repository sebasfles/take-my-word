provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}

provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.tags
  }
}

provider "github" {
  owner = try(var.github.owner, null)

  dynamic "app_auth" {
    for_each = var.github == null ? [] : [var.github]

    content {
      id              = app_auth.value.app_id
      installation_id = app_auth.value.app_installation_id
      pem_file        = var.github_app_pem
    }
  }
}

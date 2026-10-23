locals {
  project = var.deployment
  env     = "core"

  environments = {
    dev = "develop"
    prd = "main"
  }

  protected_branches = {
    develop = ["ci"]
    main    = ["ci"]
  }

  admin_repository_role_id = 5

  tags = {
    Project     = local.project
    Environment = local.env
    ManagedBy   = "terraform"
  }
}

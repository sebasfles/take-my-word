locals {
  project        = "take-my-word"
  env            = "core"
  aws_region     = "us-east-1"
  aws_account_id = "115891590483"

  github_owner               = "sebasfles"
  github_repository          = "take-my-word"
  github_app_id              = "4985607"
  github_app_installation_id = "162648841"

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

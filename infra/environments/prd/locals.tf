locals {
  project        = "take-my-word"
  env            = "prd"
  aws_region     = "us-east-1"
  aws_account_id = "115891590483"

  hosted_zone  = "takemyword.fless.dev"
  api_hostname = "api.takemyword.fless.dev"

  github_owner               = "sebasfles"
  github_repository          = "take-my-word"
  github_app_id              = "4985607"
  github_app_installation_id = "162648841"

  debug_bucket                   = false
  point_in_time_recovery         = true
  deletion_protection            = true
  secret_recovery_window_in_days = 7

  tags = {
    Project     = local.project
    Environment = local.env
    ManagedBy   = "terraform"
  }
}

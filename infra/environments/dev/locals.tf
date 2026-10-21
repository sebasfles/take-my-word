locals {
  project        = "take-my-word"
  env            = "dev"
  aws_region     = "us-east-1"
  aws_account_id = "115891590483"

  hosted_zone  = "takemyword.fless.dev"
  api_hostname = "api.dev.takemyword.fless.dev"

  github_owner               = "sebasfles"
  github_repository          = "take-my-word"
  github_app_id              = "4985607"
  github_app_installation_id = "162648841"

  debug_bucket                   = true
  point_in_time_recovery         = false
  deletion_protection            = false
  secret_recovery_window_in_days = 0

  tags = {
    Project     = local.project
    Environment = local.env
    ManagedBy   = "terraform"
  }
}

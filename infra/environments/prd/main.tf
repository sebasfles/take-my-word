module "app" {
  source = "../../stacks/app"

  env          = local.env
  api_hostname = local.api_hostname
  web_hostname = local.web_hostname
  hosted_zone  = local.hosted_zone

  github_owner      = local.github_owner
  github_repository = local.github_repository

  debug_bucket = local.debug_bucket

  point_in_time_recovery         = local.point_in_time_recovery
  deletion_protection            = local.deletion_protection
  secret_recovery_window_in_days = local.secret_recovery_window_in_days
}

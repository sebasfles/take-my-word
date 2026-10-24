module "app" {
  source = "../../stacks/app"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
    github        = github
  }

  deployment   = var.deployment
  env          = local.env
  api_hostname = local.api_hostname
  web_hostname = local.web_hostname
  hosted_zone  = var.hosted_zone
  github       = var.github

  debug_bucket                   = local.debug_bucket
  debug_audio                    = var.debug_audio
  eval_function                  = var.eval_function
  point_in_time_recovery         = local.point_in_time_recovery
  deletion_protection            = local.deletion_protection
  secret_recovery_window_in_days = local.secret_recovery_window_in_days
}

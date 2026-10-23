locals {
  project = var.deployment
  env     = "prd"

  web_hostname = var.domain
  api_hostname = "api.${local.web_hostname}"

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

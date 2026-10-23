locals {
  project = var.deployment
  env     = "dev"

  web_hostname = "dev.${var.domain}"
  api_hostname = "api.${local.web_hostname}"

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

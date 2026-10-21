resource "aws_cognito_user_pool" "this" {
  name                = var.name
  user_pool_tier      = "ESSENTIALS"
  deletion_protection = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  mfa_configuration   = "OFF"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  device_configuration {
    challenge_required_on_new_device      = false
    device_only_remembered_on_user_prompt = false
  }

  tags = { Name = var.name }
}

resource "aws_cognito_user_pool_client" "native" {
  name         = var.native_client_name
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret               = false
  explicit_auth_flows           = ["ALLOW_USER_SRP_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = var.access_token_hours
  id_token_validity      = var.access_token_hours
  refresh_token_validity = var.refresh_token_days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 10
  }
}

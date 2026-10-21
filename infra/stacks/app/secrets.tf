module "providers_secret" {
  source = "../../modules/aws/secrets"

  name                    = "${local.name_prefix}/providers"
  placeholder_keys        = ["GROQ_API_KEY", "OPENAI_API_KEY"]
  recovery_window_in_days = var.secret_recovery_window_in_days
}

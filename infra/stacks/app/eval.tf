module "eval" {
  count  = var.eval_function ? 1 : 0
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-eval"
  memory_size        = 1024
  timeout            = 120
  log_retention_days = var.log_retention_days

  environment = {
    PROVIDERS_SECRET_ID = module.providers_secret.arn
    NODE_OPTIONS        = "--enable-source-maps"
  }

  policy_statements = {
    ProvidersSecret = {
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [module.providers_secret.arn]
    }
  }
}

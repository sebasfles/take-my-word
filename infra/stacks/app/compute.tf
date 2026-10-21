locals {
  debug_audio_bucket = var.debug_audio ? aws_s3_bucket.debug[0] : null
}

module "dictate" {
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-dictate"
  memory_size        = 1024
  timeout            = 60
  log_retention_days = var.log_retention_days

  environment = merge(
    {
      TABLE_NAME          = module.table.name
      PROVIDERS_SECRET_ID = module.providers_secret.arn
      DAILY_QUOTA_MINUTES = tostring(var.daily_quota_minutes)
      NODE_OPTIONS        = "--enable-source-maps"
    },
    local.debug_audio_bucket == null ? {} : { DEBUG_BUCKET = local.debug_audio_bucket.id },
  )

  policy_statements = merge(
    {
      Table = {
        actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
        resources = [module.table.arn]
      }
      ProvidersSecret = {
        actions   = ["secretsmanager:GetSecretValue"]
        resources = [module.providers_secret.arn]
      }
    },
    local.debug_audio_bucket == null ? {} : {
      DebugAudio = {
        actions   = ["s3:PutObject"]
        resources = ["${local.debug_audio_bucket.arn}/*"]
      }
    },
  )
}

module "authorizer" {
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-authorizer"
  memory_size        = 256
  timeout            = 10
  log_retention_days = var.log_retention_days

  environment = {
    USER_POOL_ID        = module.user_pool.user_pool_id
    USER_POOL_CLIENT_ID = module.user_pool.native_client_id
    NODE_OPTIONS        = "--enable-source-maps"
  }
}

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
      TABLE_NAME                = module.table.name
      PROVIDERS_SECRET_ID       = module.providers_secret.arn
      DAILY_QUOTA_MINUTES       = tostring(var.daily_quota_minutes)
      DICTIONARY_HALF_LIFE_DAYS = tostring(var.dictionary_half_life_days)
      STT_PROMPT_TOKEN_BUDGET   = tostring(var.stt_prompt_token_budget)
      TRANSCRIBER               = var.transcriber
      REFINER                   = var.refiner
      NODE_OPTIONS              = "--enable-source-maps"
    },
    local.debug_audio_bucket == null ? {} : { DEBUG_BUCKET = local.debug_audio_bucket.id },
  )

  policy_statements = merge(
    {
      Table = {
        actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:BatchGetItem"]
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

module "api_function" {
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-api"
  memory_size        = 512
  timeout            = 15
  log_retention_days = var.log_retention_days

  environment = {
    TABLE_NAME          = module.table.name
    DAILY_QUOTA_MINUTES = tostring(var.daily_quota_minutes)
    NODE_OPTIONS        = "--enable-source-maps"
  }

  policy_statements = {
    Table = {
      actions = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
      ]
      resources = [module.table.arn]
    }
  }
}

module "dictionary_usage" {
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-dictionary-usage"
  memory_size        = 256
  timeout            = 30
  log_retention_days = var.log_retention_days

  environment = {
    TABLE_NAME   = module.table.name
    NODE_OPTIONS = "--enable-source-maps"
  }

  policy_statements = {
    ReadTerms = {
      actions   = ["dynamodb:Query"]
      resources = [module.table.arn]
    }
    CountUse = {
      actions   = ["dynamodb:UpdateItem"]
      resources = [module.table.arn]
      conditions = [{
        test     = "ForAllValues:StringEquals"
        variable = "dynamodb:Attributes"
        values   = ["PK", "SK", "useCount", "lastUsedAt"]
      }]
    }
    ReadStream = {
      actions = [
        "dynamodb:DescribeStream",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:ListStreams",
      ]
      resources = ["${module.table.arn}/stream/*"]
    }
  }
}

resource "aws_lambda_event_source_mapping" "dictionary_usage" {
  event_source_arn               = module.table.stream_arn
  function_name                  = module.dictionary_usage.arn
  starting_position              = "LATEST"
  batch_size                     = 10
  maximum_retry_attempts         = 2
  bisect_batch_on_function_error = true
  function_response_types        = ["ReportBatchItemFailures"]

  filter_criteria {
    filter {
      pattern = jsonencode({
        eventName = ["INSERT"]
        dynamodb  = { Keys = { SK = { S = [{ prefix = "DICTATION#" }] } } }
      })
    }
  }

  depends_on = [module.dictionary_usage]
}

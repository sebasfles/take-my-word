module "web_certificate" {
  source = "../../modules/aws/acm"

  domain_name = var.web_hostname
  zone_id     = data.aws_route53_zone.this.zone_id
}

module "web_secret" {
  source = "../../modules/aws/secrets"

  name                    = "${local.name_prefix}/web"
  placeholder_keys        = ["COOKIE_KEY"]
  recovery_window_in_days = var.secret_recovery_window_in_days
}

module "web_function" {
  source = "../../modules/aws/lambda"

  name               = "${local.name_prefix}-web"
  memory_size        = 512
  timeout            = 30
  log_retention_days = var.log_retention_days
  function_url       = true

  environment = {
    API_URL             = module.api.url
    USER_POOL_ID        = module.user_pool.user_pool_id
    USER_POOL_CLIENT_ID = module.user_pool.native_client_id
    WEB_SECRET_ID       = module.web_secret.arn
    WEB_ORIGIN          = "https://${var.web_hostname}"
  }

  policy_statements = {
    WebSecret = {
      actions   = ["secretsmanager:GetSecretValue"]
      resources = [module.web_secret.arn]
    }
  }
}

module "web_assets" {
  source = "../../modules/aws/s3"

  name          = "${local.name_prefix}-web-assets-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

module "web_cdn" {
  source = "../../modules/aws/cloudfront"

  name            = "${local.name_prefix}-web"
  domain          = var.web_hostname
  zone_id         = data.aws_route53_zone.this.zone_id
  certificate_arn = module.web_certificate.certificate_arn

  assets_origin_domain_name = module.web_assets.regional_domain_name
  server_origin_domain_name = module.web_function.function_url_domain
}

data "aws_iam_policy_document" "web_assets" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.web_assets.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [module.web_cdn.distribution_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web_assets" {
  bucket = module.web_assets.id
  policy = data.aws_iam_policy_document.web_assets.json
}

resource "aws_lambda_permission" "web_cdn_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = module.web_function.name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = module.web_cdn.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "web_cdn_invoke" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = module.web_function.name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = module.web_cdn.distribution_arn
}

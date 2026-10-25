locals {
  api_routes = [
    "GET /dictionary",
    "POST /dictionary",
    "PUT /dictionary/{id}",
    "DELETE /dictionary/{id}",
    "GET /styles",
    "POST /styles",
    "PUT /styles/{id}",
    "DELETE /styles/{id}",
    "GET /app-rules",
    "POST /app-rules",
    "PUT /app-rules/{id}",
    "DELETE /app-rules/{id}",
    "GET /me/settings",
    "PUT /me/settings",
    "GET /me/usage",
    "GET /dictations",
    "DELETE /dictations/{id}",
  ]
}

module "certificate" {
  source = "../../modules/aws/acm"

  domain_name = var.api_hostname
  zone_id     = data.aws_route53_zone.this.zone_id
}

module "api" {
  source = "../../modules/aws/http_api"

  name               = local.name_prefix
  domain_name        = var.api_hostname
  zone_id            = data.aws_route53_zone.this.zone_id
  certificate_arn    = module.certificate.certificate_arn
  log_retention_days = var.log_retention_days

  authorizer = {
    function_name = module.authorizer.name
    invoke_arn    = module.authorizer.invoke_arn
  }

  routes = merge(
    {
      "POST /dictations" = {
        function_name = module.dictate.name
        invoke_arn    = module.dictate.invoke_arn
      }
      "POST /dictations/segments" = {
        function_name = module.dictate.name
        invoke_arn    = module.dictate.invoke_arn
      }
    },
    {
      for route in local.api_routes : route => {
        function_name = module.api_function.name
        invoke_arn    = module.api_function.invoke_arn
      }
    },
  )
}

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

  routes = {
    "POST /dictations" = {
      function_name = module.dictate.name
      invoke_arn    = module.dictate.invoke_arn
    }
  }
}

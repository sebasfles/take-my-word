data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_route53_zone" "this" {
  name         = "${var.hosted_zone}."
  private_zone = false
}

locals {
  name_prefix = "${var.deployment}-${var.env}"
}

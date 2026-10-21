module "user_pool" {
  source = "../../modules/aws/cognito"

  name                = local.name_prefix
  deletion_protection = var.deletion_protection
}

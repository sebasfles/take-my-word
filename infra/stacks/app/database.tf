module "table" {
  source = "../../modules/aws/dynamodb"

  name                   = local.name_prefix
  point_in_time_recovery = var.point_in_time_recovery
  deletion_protection    = var.deletion_protection
}

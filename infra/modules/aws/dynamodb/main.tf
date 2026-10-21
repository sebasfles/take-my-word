resource "aws_dynamodb_table" "this" {
  name                        = var.name
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "PK"
  range_key                   = "SK"
  deletion_protection_enabled = var.deletion_protection
  stream_enabled              = true
  stream_view_type            = "NEW_IMAGE"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = var.ttl_attribute
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  tags = { Name = var.name }
}

resource "aws_s3_bucket" "debug" {
  count = var.debug_bucket ? 1 : 0

  bucket        = "${local.name_prefix}-debug-${data.aws_caller_identity.current.account_id}"
  force_destroy = true

  tags = { Name = "${local.name_prefix}-debug" }
}

resource "aws_s3_bucket_public_access_block" "debug" {
  count = var.debug_bucket ? 1 : 0

  bucket                  = aws_s3_bucket.debug[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "debug" {
  count = var.debug_bucket ? 1 : 0

  bucket = aws_s3_bucket.debug[0].id

  rule {
    id     = "expire-after-one-day"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

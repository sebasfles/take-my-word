resource "aws_secretsmanager_secret" "this" {
  name                    = var.name
  recovery_window_in_days = var.recovery_window_in_days

  tags = { Name = var.name }
}

resource "aws_secretsmanager_secret_version" "placeholder" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode({ for key in var.placeholder_keys : key => "" })

  lifecycle {
    ignore_changes = [secret_string, version_stages]
  }
}

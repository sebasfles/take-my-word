resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days

  tags = { Name = var.name }
}

resource "aws_iam_role" "this" {
  name = var.name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = var.name }
}

resource "aws_iam_role_policy" "logs" {
  name = "logs"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.this.arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "access" {
  count = length(var.policy_statements) > 0 ? 1 : 0

  name = "access"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      for sid, statement in var.policy_statements : {
        Sid      = replace(sid, "/[^0-9A-Za-z]/", "")
        Effect   = "Allow"
        Action   = statement.actions
        Resource = statement.resources
      }
    ]
  })
}

data "archive_file" "placeholder" {
  type        = "zip"
  output_path = "${path.module}/.placeholder.zip"

  source {
    filename = "index.mjs"
    content  = "export const handler = async () => ({ statusCode: 503, headers: { \"content-type\": \"text/plain\" }, body: \"not deployed\\n\" });\n"
  }
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.this.arn
  handler       = var.handler
  runtime       = var.runtime
  architectures = [var.architecture]
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = data.archive_file.placeholder.output_path
  source_code_hash = data.archive_file.placeholder.output_base64sha256

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  dynamic "environment" {
    for_each = length(var.environment) > 0 ? [var.environment] : []

    content {
      variables = environment.value
    }
  }

  tags = { Name = var.name }

  lifecycle {
    ignore_changes = [filename, source_code_hash, publish]
  }

  depends_on = [aws_iam_role_policy.logs]
}

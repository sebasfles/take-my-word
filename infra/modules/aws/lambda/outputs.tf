output "name" {
  description = "Function name"
  value       = aws_lambda_function.this.function_name
}

output "arn" {
  description = "Function ARN"
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "ARN API Gateway integrations invoke"
  value       = aws_lambda_function.this.invoke_arn
}

output "function_url_domain" {
  description = "Host of the Function URL, null without one"
  value       = var.function_url ? split("/", aws_lambda_function_url.this[0].function_url)[2] : null
}

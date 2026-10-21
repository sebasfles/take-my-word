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

output "user_pool_id" {
  description = "User pool id"
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "User pool ARN"
  value       = aws_cognito_user_pool.this.arn
}

output "native_client_id" {
  description = "Id of the app client desktop and mobile sign in with"
  value       = aws_cognito_user_pool_client.native.id
}

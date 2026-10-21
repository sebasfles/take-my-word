output "api_url" {
  description = "Base URL of the environment's API"
  value       = module.app.api_url
}

output "table_name" {
  description = "DynamoDB table, also the TABLE_NAME of a local .env"
  value       = module.app.table_name
}

output "providers_secret_id" {
  description = "Secret holding the provider keys, written outside Terraform"
  value       = module.app.providers_secret_id
}

output "user_pool_id" {
  description = "Cognito user pool id"
  value       = module.app.user_pool_id
}

output "native_client_id" {
  description = "App client id desktop and mobile sign in with"
  value       = module.app.native_client_id
}

output "dictate_function_name" {
  description = "dictate Lambda; Terraform writes it into the Actions environment's DICTATE_FUNCTION_NAME"
  value       = module.app.dictate_function_name
}

output "authorizer_function_name" {
  description = "authorizer Lambda; Terraform writes it into the Actions environment's AUTHORIZER_FUNCTION_NAME"
  value       = module.app.authorizer_function_name
}

output "deploy_role_arn" {
  description = "Role the deploy workflow assumes over OIDC; Terraform writes it into the Actions environment's AWS_ROLE_ARN"
  value       = module.app.deploy_role_arn
}

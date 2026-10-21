output "api_url" {
  description = "Base URL of the environment's API"
  value       = module.api.url
}

output "table_name" {
  description = "DynamoDB table of the environment"
  value       = module.table.name
}

output "providers_secret_id" {
  description = "Secret holding GROQ_API_KEY and OPENAI_API_KEY"
  value       = module.providers_secret.arn
}

output "user_pool_id" {
  description = "Cognito user pool id"
  value       = module.user_pool.user_pool_id
}

output "native_client_id" {
  description = "App client id desktop and mobile sign in with"
  value       = module.user_pool.native_client_id
}

output "dictate_function_name" {
  description = "dictate Lambda, updated by the deploy workflow"
  value       = module.dictate.name
}

output "authorizer_function_name" {
  description = "authorizer Lambda, updated by the deploy workflow"
  value       = module.authorizer.name
}

output "api_function_name" {
  description = "api Lambda, updated by the deploy workflow"
  value       = module.api_function.name
}

output "dictionary_usage_function_name" {
  description = "dictionary-usage Lambda, updated by the deploy workflow"
  value       = module.dictionary_usage.name
}

output "deploy_role_arn" {
  description = "Role the deploy workflow assumes over OIDC"
  value       = aws_iam_role.deploy.arn
}

output "debug_bucket" {
  description = "Debug audio bucket, null where the environment has none"
  value       = var.debug_bucket ? aws_s3_bucket.debug[0].id : null
}

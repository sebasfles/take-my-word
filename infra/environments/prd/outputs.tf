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

output "api_function_name" {
  description = "api Lambda; Terraform writes it into the Actions environment's API_FUNCTION_NAME"
  value       = module.app.api_function_name
}

output "dictionary_usage_function_name" {
  description = "dictionary-usage Lambda; Terraform writes it into the Actions environment's DICTIONARY_USAGE_FUNCTION_NAME"
  value       = module.app.dictionary_usage_function_name
}

output "deploy_role_arn" {
  description = "Role the deploy workflow assumes over OIDC; Terraform writes it into the Actions environment's AWS_ROLE_ARN"
  value       = module.app.deploy_role_arn
}

output "web_url" {
  description = "HTTPS URL of the web"
  value       = module.app.web_url
}

output "web_function_name" {
  description = "web Lambda; Terraform writes it into the Actions environment's WEB_FUNCTION_NAME"
  value       = module.app.web_function_name
}

output "web_assets_bucket" {
  description = "Static assets bucket; Terraform writes it into the Actions environment's WEB_ASSETS_BUCKET"
  value       = module.app.web_assets_bucket
}

output "web_distribution_id" {
  description = "Web distribution; Terraform writes it into the Actions environment's WEB_DISTRIBUTION_ID"
  value       = module.app.web_distribution_id
}

output "web_secret_id" {
  description = "Secret holding the web's cookie key, written outside Terraform"
  value       = module.app.web_secret_id
}

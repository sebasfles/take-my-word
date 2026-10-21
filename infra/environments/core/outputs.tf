output "github_oidc_provider_arn" {
  description = "OIDC provider every environment's deploy role federates with"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "actions_environments" {
  description = "Actions environment per deploy environment, with the only branch allowed to enter it"
  value       = local.environments
}

output "ruleset_ids" {
  description = "Ruleset protecting each branch"
  value       = { for branch, ruleset in github_repository_ruleset.this : branch => ruleset.ruleset_id }
}

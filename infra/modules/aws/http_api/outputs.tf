output "api_id" {
  description = "HTTP API id"
  value       = aws_apigatewayv2_api.this.id
}

output "url" {
  description = "Base URL of the API on its custom domain"
  value       = "https://${aws_route53_record.this.fqdn}"
}

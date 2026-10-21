output "distribution_id" {
  description = "Distribution id, used to create invalidations"
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "Distribution ARN, the source of the bucket policy and the Function URL permissions"
  value       = aws_cloudfront_distribution.this.arn
}

output "url" {
  description = "HTTPS URL the distribution answers on"
  value       = "https://${var.domain}"
}

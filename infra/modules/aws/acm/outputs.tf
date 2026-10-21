output "certificate_arn" {
  description = "ARN of the certificate, available once DNS validation completes"
  value       = aws_acm_certificate_validation.this.certificate_arn
}

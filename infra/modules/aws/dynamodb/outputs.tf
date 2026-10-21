output "name" {
  description = "Table name"
  value       = aws_dynamodb_table.this.name
}

output "arn" {
  description = "Table ARN"
  value       = aws_dynamodb_table.this.arn
}

output "stream_arn" {
  description = "ARN of the table's NEW_IMAGE stream"
  value       = aws_dynamodb_table.this.stream_arn
}

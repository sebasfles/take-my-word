variable "name" {
  description = "Table name"
  type        = string
}

variable "ttl_attribute" {
  description = "Attribute holding the epoch second at which DynamoDB deletes the item; every item kind sets it"
  type        = string
  default     = "expiresAt"
}

variable "point_in_time_recovery" {
  description = "Whether the table keeps continuous backups"
  type        = bool
}

variable "deletion_protection" {
  description = "Whether the table refuses to be deleted"
  type        = bool
}

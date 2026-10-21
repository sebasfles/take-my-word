variable "name" {
  description = "Bucket name, globally unique"
  type        = string
}

variable "force_destroy" {
  description = "Whether Terraform may delete the bucket while it still holds objects"
  type        = bool
  default     = false
}

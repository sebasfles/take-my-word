variable "name" {
  description = "User pool name"
  type        = string
}

variable "native_client_name" {
  description = "Name of the app client desktop and mobile sign in with"
  type        = string
  default     = "native"
}

variable "access_token_hours" {
  description = "Lifetime of access and id tokens"
  type        = number
  default     = 1
}

variable "refresh_token_days" {
  description = "Lifetime of a refresh token; rotation hands out a new one on every renewal"
  type        = number
  default     = 3650
}

variable "deletion_protection" {
  description = "Whether the pool refuses to be deleted"
  type        = bool
}

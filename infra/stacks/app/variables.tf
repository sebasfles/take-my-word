variable "env" {
  description = "Environment name, part of every resource name"
  type        = string
}

variable "api_hostname" {
  description = "Hostname the HTTP API answers on"
  type        = string
}

variable "hosted_zone" {
  description = "Route 53 zone that answers for the API hostname; read, never owned"
  type        = string
}

variable "github_owner" {
  description = "Owner of the repository the deploy role trusts"
  type        = string
}

variable "github_repository" {
  description = "Repository the deploy role trusts"
  type        = string
}

variable "daily_quota_minutes" {
  description = "Audio minutes each user may dictate per UTC day"
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "Retention of every log group of the environment"
  type        = number
  default     = 30
}

variable "debug_bucket" {
  description = "Whether the environment has the debug audio bucket (dev only)"
  type        = bool
  default     = false
}

variable "debug_audio" {
  description = "Whether dictate keeps each request's audio in the debug bucket for a day; needs debug_bucket"
  type        = bool
  default     = false

  validation {
    condition     = !var.debug_audio || var.debug_bucket
    error_message = "debug_audio needs debug_bucket."
  }
}

variable "point_in_time_recovery" {
  description = "Whether the table keeps continuous backups"
  type        = bool
  default     = false
}

variable "deletion_protection" {
  description = "Whether the table and the user pool refuse to be deleted"
  type        = bool
  default     = false
}

variable "secret_recovery_window_in_days" {
  description = "Days a deleted providers secret stays recoverable"
  type        = number
  default     = 7
}

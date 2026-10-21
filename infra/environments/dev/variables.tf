variable "github_app_pem" {
  description = "Private key of the GitHub App Terraform manages the repository's GitHub side as; passed only as TF_VAR_github_app_pem from the workspace .env"
  type        = string
  sensitive   = true
}

variable "debug_audio" {
  description = "Whether dictate keeps each request's audio in the debug bucket for a day"
  type        = bool
  default     = false
}

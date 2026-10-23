variable "deployment" {
  description = "Name of the deployment, the prefix of its resource names"
  type        = string
  default     = "take-my-word"
}

variable "aws_account_id" {
  description = "Account every resource lives in; any other account is refused"
  type        = string
}

variable "aws_region" {
  description = "Region of the deployment"
  type        = string
}

variable "github" {
  description = "Repository whose Actions deploy the code, and the GitHub App Terraform manages it as"
  type = object({
    owner               = string
    repository          = string
    app_id              = string
    app_installation_id = string
  })
}

variable "github_app_pem" {
  description = "Private key of the GitHub App; passed only as TF_VAR_github_app_pem from the workspace .env"
  type        = string
  sensitive   = true
}

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
  description = "Region of the deployment; the web's certificate is always issued in us-east-1 for CloudFront"
  type        = string
}

variable "domain" {
  description = "Host of the prd web; dev answers on dev.<domain> and each API on api.<web host>"
  type        = string
}

variable "hosted_zone" {
  description = "Public Route 53 zone holding the domain; read, never owned"
  type        = string
}

variable "github" {
  description = "Repository whose Actions deploy the code, and the GitHub App Terraform manages it as; null for a deployment without CI"
  type = object({
    owner               = string
    repository          = string
    app_id              = string
    app_installation_id = string
  })
  default = null
}

variable "github_app_pem" {
  description = "Private key of the GitHub App; passed only as TF_VAR_github_app_pem from the workspace .env"
  type        = string
  sensitive   = true
  default     = null
}

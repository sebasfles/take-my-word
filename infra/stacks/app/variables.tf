variable "deployment" {
  description = "Name of the deployment, the first part of every resource name"
  type        = string
}

variable "env" {
  description = "Environment name, part of every resource name"
  type        = string
}

variable "api_hostname" {
  description = "Hostname the HTTP API answers on"
  type        = string
}

variable "web_hostname" {
  description = "Hostname the web answers on through CloudFront"
  type        = string
}

variable "hosted_zone" {
  description = "Route 53 zone that answers for the API hostname; read, never owned"
  type        = string
}

variable "github" {
  description = "Repository whose Actions deploy the code; null leaves out the deploy role and the Actions variables"
  type = object({
    owner      = string
    repository = string
  })
  default = null
}

variable "daily_quota_minutes" {
  description = "Audio minutes each user may dictate per UTC day"
  type        = number
  default     = 60
}

variable "dictionary_half_life_days" {
  description = "Days after which a dictionary term's usage weighs half in its ranking"
  type        = number
  default     = 30
}

variable "stt_prompt_token_budget" {
  description = "Upper bound of tokens for the dictionary terms in the transcriber's prompt (Whisper allows 224)"
  type        = number
  default     = 224
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

variable "eval_function" {
  description = "Whether the environment has the eval Lambda that calls provider adapters directly for the evaluation harness (dev only)"
  type        = bool
  default     = false

  validation {
    condition     = !var.eval_function || var.env == "dev"
    error_message = "eval_function exists only in dev."
  }
}

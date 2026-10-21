variable "name" {
  description = "Function name, also the log group suffix and the IAM role name"
  type        = string
}

variable "handler" {
  description = "Handler path inside the bundle"
  type        = string
  default     = "index.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs24.x"
}

variable "architecture" {
  description = "x86_64 or arm64"
  type        = string
  default     = "arm64"
}

variable "memory_size" {
  description = "Memory in MB"
  type        = number
}

variable "timeout" {
  description = "Timeout in seconds"
  type        = number
}

variable "environment" {
  description = "Environment variables of the function. The deploy workflow never touches them; Terraform owns them."
  type        = map(string)
  default     = {}
}

variable "policy_statements" {
  description = "Extra IAM statements for the function's role, keyed by statement id, each with optional conditions"
  type = map(object({
    actions   = list(string)
    resources = list(string)
    conditions = optional(list(object({
      test     = string
      variable = string
      values   = list(string)
    })), [])
  }))
  default = {}
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention"
  type        = number
}

variable "name" {
  description = "API name, also the access log group suffix"
  type        = string
}

variable "domain_name" {
  description = "Custom domain the API answers on; the default execute-api endpoint is disabled"
  type        = string
}

variable "zone_id" {
  description = "Route 53 zone the domain's alias record is written into"
  type        = string
}

variable "certificate_arn" {
  description = "Validated ACM certificate for the domain, in the API's region"
  type        = string
}

variable "authorizer" {
  description = "Lambda authorizer every route goes through; it answers HTTP API simple responses"
  type = object({
    function_name = string
    invoke_arn    = string
  })
}

variable "authorizer_cache_seconds" {
  description = "How long API Gateway caches the authorizer's answer per Authorization header"
  type        = number
  default     = 300
}

variable "routes" {
  description = "Routes keyed by route key (\"POST /dictations\"), each proxied to one Lambda with payload format 2.0"
  type = map(object({
    function_name = string
    invoke_arn    = string
  }))
}

variable "throttling_rate_limit" {
  description = "Steady requests per second across the stage"
  type        = number
  default     = 10
}

variable "throttling_burst_limit" {
  description = "Burst of requests across the stage"
  type        = number
  default     = 20
}

variable "log_retention_days" {
  description = "Retention of the access log group"
  type        = number
}

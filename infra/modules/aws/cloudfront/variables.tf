variable "name" {
  description = "Name prefix of the distribution, its origin access controls and its headers policy"
  type        = string
}

variable "domain" {
  description = "Public domain the distribution answers on"
  type        = string
}

variable "zone_id" {
  description = "Route 53 zone the alias records are written into"
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate covering the domain, issued in us-east-1"
  type        = string
}

variable "assets_origin_domain_name" {
  description = "Regional domain name of the bucket holding the static build output"
  type        = string
}

variable "server_origin_domain_name" {
  description = "Host of the Function URL running the server"
  type        = string
}

variable "static_path_patterns" {
  description = "Paths served from the bucket; a pattern the bucket does not hold answers 403 instead of falling through to the server"
  type        = list(string)
  default     = ["/_next/static/*", "/static/*"]
}

variable "price_class" {
  description = "Edge locations the distribution uses"
  type        = string
  default     = "PriceClass_100"
}

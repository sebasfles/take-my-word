variable "domain_name" {
  description = "Domain name on the certificate"
  type        = string
}

variable "zone_id" {
  description = "Route 53 zone the DNS validation records are written into"
  type        = string
}

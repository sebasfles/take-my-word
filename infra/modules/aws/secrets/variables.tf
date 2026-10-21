variable "name" {
  description = "Secret name"
  type        = string
}

variable "placeholder_keys" {
  description = "Keys of the JSON object the first version holds, each with an empty value; the real values are written outside Terraform and never reach its state"
  type        = list(string)
}

variable "recovery_window_in_days" {
  description = "Days a deleted secret stays recoverable; 0 deletes it at once"
  type        = number
}

variable "aws_region" {
  type    = string
  default = "ap-south-1"
}

variable "domain" {
  description = "Root domain already hosted in Route53 (vprocly.com)."
  type        = string
  default     = "vprocly.com"
}

variable "app_instance_type" {
  description = "Instance for the single backend host (api+worker+keycloak+nats+clamav+temporal+excel+caddy)."
  type        = string
  default     = "t4g.medium"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "ssh_cidr" {
  description = "CIDR allowed to reach the instance over SSH. Leave empty to rely on SSM Session Manager only (recommended)."
  type        = string
  default     = ""
}

variable "reused_secrets" {
  description = <<-EOT
    Secrets already real and working (Gemini, Sarvam, SMTP) -- reused as-is rather than regenerated.
    Passed via -var-file so real values never live in this repo's .tf files.
  EOT
  type = object({
    gemini_api_key        = string
    google_places_api_key = string
    sarvam_api_key        = string
    sarvam_org_id         = string
    sarvam_workspace_id   = string
    sarvam_app_id         = string
    sarvam_connection_id  = string
    sarvam_agent_phone    = string
    sarvam_webhook_secret = string
    smtp_host             = string
    smtp_port             = number
    smtp_user             = string
    smtp_pass             = string
    smtp_from             = string
    noreply_smtp_host     = string
    noreply_smtp_port     = number
    noreply_smtp_user     = string
    noreply_smtp_pass     = string
    noreply_smtp_from     = string
  })
  sensitive = true
}

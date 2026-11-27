variable "github_owner" {
  description = "GitHub account that owns the repository."
  type        = string
  default     = "ppj89"
}

variable "repository_name" {
  description = "Repository managed by this configuration."
  type        = string
  default     = "family-platform"
}

variable "required_status_checks" {
  description = <<-EOT
    CI job names (.github/workflows/ci.yml) that must pass before a pull
    request can merge into main. The iOS simulator build is left out on
    purpose: macOS runners queue for a long time and it has no production
    impact.
  EOT
  type        = list(string)
  default = [
    "Frontend build",
    "Backend test",
    "Security checks",
    "Android debug build",
    "Docker production config",
    "Go API integration",
    "Production stack smoke",
    "Terraform validate",
  ]
}

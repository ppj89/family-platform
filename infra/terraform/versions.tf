terraform {
  required_version = ">= 1.10"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.6"
    }
  }

  # State lives in the existing Cloudflare R2 bucket (S3-compatible) under
  # terraform/. Connection details and keys come from the git-ignored
  # backend.hcl — see backend.hcl.example and README.md.
  backend "s3" {}
}

# Auth: export GITHUB_TOKEN (e.g. `gh auth token`) before plan/apply.
provider "github" {
  owner = var.github_owner
}

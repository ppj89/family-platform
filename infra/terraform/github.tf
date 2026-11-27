# The repository already existed before Terraform; these import blocks adopt
# it (and its main branch protection) into state instead of creating new ones.
import {
  to = github_repository.app
  id = var.repository_name
}

resource "github_repository" "app" {
  name       = var.repository_name
  visibility = "public"

  has_issues   = true
  has_projects = true
  has_wiki     = true

  allow_merge_commit     = true
  allow_squash_merge     = true
  allow_rebase_merge     = true
  delete_branch_on_merge = true

  vulnerability_alerts = true

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"
    }
  }

  lifecycle {
    # Never let a plan delete the production repository.
    prevent_destroy = true
    # Free-form fields edited in the GitHub UI are not managed here.
    ignore_changes = [description, homepage_url, topics]
  }
}

resource "github_repository_dependabot_security_updates" "app" {
  repository = github_repository.app.name
  enabled    = true
}

resource "github_branch_protection" "main" {
  repository_id = github_repository.app.node_id
  pattern       = "main"

  # The owner can still push directly (hotfixes, release automation);
  # everyone else must go through a green pull request.
  enforce_admins = false

  allows_force_pushes = false
  allows_deletions    = false

  required_status_checks {
    strict   = false
    contexts = var.required_status_checks
  }
}

resource "github_workflow_repository_permissions" "this" {
  repository                       = var.github.repository
  default_workflow_permissions     = "read"
  can_approve_pull_request_reviews = true
}

resource "github_repository_environment" "this" {
  for_each = local.environments

  repository  = var.github.repository
  environment = each.key

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "this" {
  for_each = local.environments

  repository     = var.github.repository
  environment    = github_repository_environment.this[each.key].environment
  branch_pattern = each.value
}

resource "github_repository_ruleset" "this" {
  for_each = local.protected_branches

  repository  = var.github.repository
  name        = "protect-${each.key}"
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["refs/heads/${each.key}"]
      exclude = []
    }
  }

  bypass_actors {
    actor_id    = local.admin_repository_role_id
    actor_type  = "RepositoryRole"
    bypass_mode = "always"
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      required_approving_review_count = 0
      allowed_merge_methods           = ["merge"]
    }

    required_status_checks {
      strict_required_status_checks_policy = false

      dynamic "required_check" {
        for_each = each.value

        content {
          context = required_check.value
        }
      }
    }
  }
}

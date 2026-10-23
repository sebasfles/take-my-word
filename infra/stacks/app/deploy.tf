locals {
  ci = var.github != null
}

data "aws_iam_openid_connect_provider" "github" {
  count = local.ci ? 1 : 0

  url = "https://token.actions.githubusercontent.com"
}

data "github_user" "owner" {
  count = local.ci ? 1 : 0

  username = var.github.owner
}

data "github_repository" "this" {
  count = local.ci ? 1 : 0

  full_name = "${var.github.owner}/${var.github.repository}"
}

data "aws_iam_policy_document" "assume_github" {
  count = local.ci ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github.owner}@${data.github_user.owner[0].id}/${var.github.repository}@${data.github_repository.this[0].repo_id}:environment:${var.env}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  count = local.ci ? 1 : 0

  name               = "${local.name_prefix}-deploy"
  assume_role_policy = data.aws_iam_policy_document.assume_github[0].json

  tags = { Name = "${local.name_prefix}-deploy" }
}

moved {
  from = aws_iam_role.deploy
  to   = aws_iam_role.deploy[0]
}

resource "aws_iam_role_policy" "deploy" {
  count = local.ci ? 1 : 0

  name = "deploy"
  role = aws_iam_role.deploy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "UpdateFunctions"
        Effect = "Allow"
        Action = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
        Resource = [
          module.dictate.arn,
          module.authorizer.arn,
          module.api_function.arn,
          module.dictionary_usage.arn,
          module.web_function.arn,
        ]
      },
      {
        Sid      = "ListWebAssets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = module.web_assets.arn
      },
      {
        Sid      = "SyncWebAssets"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${module.web_assets.arn}/*"
      },
      {
        Sid      = "InvalidateWeb"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = module.web_cdn.distribution_arn
      },
    ]
  })
}

moved {
  from = aws_iam_role_policy.deploy
  to   = aws_iam_role_policy.deploy[0]
}

resource "github_actions_environment_variable" "this" {
  for_each = local.ci ? {
    AWS_ROLE_ARN                   = aws_iam_role.deploy[0].arn
    AWS_REGION                     = data.aws_region.current.region
    DICTATE_FUNCTION_NAME          = module.dictate.name
    AUTHORIZER_FUNCTION_NAME       = module.authorizer.name
    API_FUNCTION_NAME              = module.api_function.name
    DICTIONARY_USAGE_FUNCTION_NAME = module.dictionary_usage.name
    WEB_FUNCTION_NAME              = module.web_function.name
    WEB_ASSETS_BUCKET              = module.web_assets.id
    WEB_DISTRIBUTION_ID            = module.web_cdn.distribution_id
  } : {}

  repository    = var.github.repository
  environment   = var.env
  variable_name = each.key
  value         = each.value
}

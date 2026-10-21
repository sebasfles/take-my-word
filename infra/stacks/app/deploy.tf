data "aws_iam_policy_document" "assume_github" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_owner}/${var.github_repository}:environment:${var.env}"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${local.name_prefix}-deploy"
  assume_role_policy = data.aws_iam_policy_document.assume_github.json

  tags = { Name = "${local.name_prefix}-deploy" }
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy"
  role = aws_iam_role.deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "UpdateFunctions"
      Effect   = "Allow"
      Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction"]
      Resource = [module.dictate.arn, module.authorizer.arn]
    }]
  })
}

resource "github_actions_environment_variable" "this" {
  for_each = {
    AWS_ROLE_ARN             = aws_iam_role.deploy.arn
    AWS_REGION               = data.aws_region.current.region
    DICTATE_FUNCTION_NAME    = module.dictate.name
    AUTHORIZER_FUNCTION_NAME = module.authorizer.name
  }

  repository    = var.github_repository
  environment   = var.env
  variable_name = each.key
  value         = each.value
}

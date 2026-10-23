---
updated: 2026-10-23
source: 0016_self_hosting
---

# Infra

The AWS account, the dev and prd environments and the delivery pipeline that every other module runs on.
Terraform describes everything and only Sebastian applies it; GitHub Actions only swaps Lambda code.
`develop` deploys dev, `main` deploys prd, and the dev deploy opens the promotion PR.
The same code runs a self-hosted deployment through `pnpm selfhost`, from one gitignored `deployment.json`.

## Boundaries

- Owns: the deployment config, `pnpm tf`, `pnpm deploy:*` and `pnpm selfhost` (`packages/deployment`), the self-host guide and skill (`self-host/`), Terraform (`core`, `dev`, `prd`, `stacks/app`, `modules/aws/*`), the HTTP API, the Lambdas as resources, the DynamoDB table resource, the provider-key secret, the dev debug bucket, web hosting, DNS, CloudWatch metrics, the deploy roles and the workflows.
- Does not own: the code inside each Lambda, the Cognito configuration choices (auth), the item kinds in the table (dictation, dictionary, styles), desktop releases and mobile builds (desktop, mobile).
- Code: `infra/`, `packages/deployment/`, `self-host/`, `.github/workflows`.

## Documents

- [prd.md](prd.md): product behavior
- [trd.md](trd.md): structure and resources
- [ard.md](ard.md): decisions and debt
- [database.md](database.md): the table as a resource
- [flows.md](flows.md): deploy and promotion

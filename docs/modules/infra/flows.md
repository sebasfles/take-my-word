---
updated: 2026-10-23
source: 0016_self_hosting
---

# Infra: flows

Only flows that deserve a diagram.

## Deploy and promotion

Runs on every merge to `develop` and to `main` that touches a deployable app.

```mermaid
sequenceDiagram
  participant S as Sebastian
  participant G as GitHub Actions
  participant A as AWS (env account role)
  S->>G: merge PR into develop
  G->>G: diff the push: api side, web side
  G->>G: pnpm deploy:<side> build, with no AWS credentials
  G->>A: assume dev deploy role over OIDC, pnpm deploy:<side> swap
  G->>A: api side: aws lambda update-function-code (authorizer, dictate, api, dictionary-usage)
  G->>A: web side: sync /_next/static, update the web function, sync the rest, invalidate CloudFront
  G->>G: open promotion PR develop to main
  S->>G: merge promotion PR into main
  G->>A: build, then assume prd deploy role over OIDC and swap
```

Infrastructure changes never take this path: Sebastian runs Terraform from his machine, and the Lambda module ignores the code fields so the next apply does not undo a deploy.

## Self-host setup and update

`pnpm selfhost` (or the skill, which runs it with `--yes` after showing `--plan`); every step is idempotent, so a failed run is fixed by running it again.

```mermaid
sequenceDiagram
  participant P as Person
  participant C as pnpm selfhost
  participant A as AWS account
  P->>C: profile, region, domain, envs, keys
  C->>A: STS: the profile's account (must match deployment.json once set)
  C->>A: find the public zone holding the domain
  C->>A: create or accept the state bucket only if tagged as this deployment's
  loop each env
    C->>A: terraform plan, apply after agreement when there are changes
  end
  C->>A: write the provider keys and COOKIE_KEY through the SDK when they differ
  C->>A: build once, swap per env when commit, build inputs or infra changed
  C->>A: first user, only in an empty pool
  C->>A: wait for /.well-known/take-my-word.json to answer
  C-->>P: URLs and the temporary password
```

`pnpm selfhost remove` lifts deletion protection and the secret recovery window, destroys every env, deletes its own state bucket, then polls the account until nothing tagged or named for the deployment is left.

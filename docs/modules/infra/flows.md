---
updated: 2026-10-21
source: 0004_web_landing
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
  G->>A: assume dev deploy role over OIDC
  G->>G: diff the push: api side, web side
  G->>A: api side: aws lambda update-function-code (authorizer, dictate, api, dictionary-usage)
  G->>A: web side: sync /_next/static, update the web function, sync the rest, invalidate CloudFront
  G->>G: open promotion PR develop to main
  S->>G: merge promotion PR into main
  G->>A: assume prd deploy role over OIDC
  G->>A: aws lambda update-function-code
```

Infrastructure changes never take this path: Sebastian runs Terraform from his machine, and the Lambda module ignores the code fields so the next apply does not undo a deploy.

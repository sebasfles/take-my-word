---
updated: 2026-10-20
source: setup
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
  G->>A: aws lambda update-function-code (changed apps only)
  G->>G: open promotion PR develop to main
  S->>G: merge promotion PR into main
  G->>A: assume prd deploy role over OIDC
  G->>A: aws lambda update-function-code
```

Infrastructure changes never take this path: Sebastian runs Terraform from his machine, and the Lambda module ignores the code fields so the next apply does not undo a deploy.

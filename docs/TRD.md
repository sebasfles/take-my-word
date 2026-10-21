---
updated: 2026-10-20
source: setup
---

# Technical Requirements Document

Describes the whole application.
Nothing is built yet: every section states the planned shape, and phase 1 (`docs/tasks/`) turns it into code.
One public monorepo, `sebasfles/take-my-word`, holds every app, the infrastructure and these docs.

## Components

| Component | Kind | Path | Base branch | Stack |
|---|---|---|---|---|
| api | app | `apps/api` | `develop` | Node 24, Hono on Lambda (ARM64, esbuild), zod |
| web | app | `apps/web` | `develop` | Next.js App Router, OpenNext on Lambda plus CloudFront |
| desktop | app | `apps/desktop` | `develop` | Tauri 2 (Rust shell), React + TypeScript UI |
| mobile | app | `apps/mobile` | `develop` | Expo managed workflow, EAS Build, Submit and Update |
| shared | package | `packages/shared` | `develop` | TypeScript, zod contracts shared by api, web, desktop and mobile |
| infra | code | `infra` | `develop` | Terraform, AWS provider |

Package manager: pnpm workspace at the root; Node version pinned in `.nvmrc`.

### api

- Stack: Node 24, Hono, zod, AWS SDK v3; bundled with esbuild into two Lambdas, `api` (every CRUD route) and `dictate` (`POST /dictations`, more memory, 60 s timeout), plus `dictionary-usage` on the table stream and the Lambda authorizer.
- Layout: one folder per module (`auth/`, `dictation/`, `dictionary/`, `styles/`), provider adapters under `dictation/providers/`.
- Install: `pnpm install --frozen-lockfile` at the root.
- Workspace files: `.env` with table name, secret id and Cognito ids for local runs.
- API spec: `none`; the zod contracts in `packages/shared` are the source of truth.
- Data: one DynamoDB table `take-my-word-{env}`, no ORM, no migrations; item kinds per module in each `database.md`.
- Delivery: GitHub Actions on `develop` (dev) and `main` (prd) build and run `aws lambda update-function-code`; see [infra](modules/infra/README.md).

### web

- Stack: Next.js App Router, React, TypeScript; built with OpenNext, served by Lambda behind CloudFront.
- Layout: route groups for landing, sign-in, settings (dictionary, styles, app rules), history.
- Install: root `pnpm install --frozen-lockfile`.
- Workspace files: `.env.local` with API base URL and Cognito ids.
- Delivery: same workflow as api; static assets to S3, CloudFront invalidation.

### desktop

- Stack: Tauri 2 with Rust for the OS layer (`rdev` key hook, `cpal` recording, `enigo` paste, active window, keychain) and React + TypeScript for the settings window and overlay.
- Layout: `src/` (UI), `src-tauri/` (Rust shell and plugins).
- Install: root `pnpm install --frozen-lockfile`, Rust toolchain via `rustup`, platform prerequisites of Tauri 2.
- Workspace files: none beyond the build-time API and Cognito configuration.
- Delivery: `tauri-action` on tags `desktop-v*` publishes installers and `latest.json` to GitHub Releases; Windows first, macOS and Linux in phase 5.

### mobile

- Stack: Expo managed workflow, `expo-audio`, `expo-secure-store`; EAS Build, Submit and Update.
- Layout: Expo app with one dictation screen and a sign-in screen.
- Install: root `pnpm install --frozen-lockfile`, EAS CLI signed in.
- Workspace files: EAS profiles per env in `eas.json`.
- Delivery: EAS workflows from `apps/mobile`; channels map to dev and prd.

### infra

- Stack: Terraform, `environments/{core,dev,prd}`, `stacks/app`, `modules/aws/*`, applied only from Sebastian's machine with the SSO profile `fless-takemyword`.
- Delivery: `core` owns the GitHub OIDC provider, GitHub App wiring, Actions environments and branch rulesets; `stacks/app` owns one deploy role per env; see [infra](modules/infra/trd.md).

## Verification targets

`verify-task` reads this table literally.
Phase 1 sets every command; until then they are `unknown`.

| Target | Path | lint | typecheck | unit | e2e |
|---|---|---|---|---|---|
| api | `apps/api` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | unknown |
| web | `apps/web` | unknown | unknown | unknown | unknown |
| desktop | `apps/desktop` | unknown | unknown | unknown | n/a |
| mobile | `apps/mobile` | unknown | unknown | unknown | n/a |
| shared | `packages/shared` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | n/a |
| infra | `infra` | `terraform fmt -check -recursive` | `terraform validate` per environment | n/a | n/a |

## Modules

Modules belong to the application and may span components.

| Module | Purpose | Components | Docs |
|---|---|---|---|
| auth | Cognito sign-in, JWT authorizer, token storage in every client | api, web, desktop, mobile, infra | [README](modules/auth/README.md) |
| dictation | `POST /dictations`: transcriber and refiner ports, quota, history | api, shared, web | [README](modules/dictation/README.md) |
| dictionary | Personal terms with aliases, usage tracking, ranking into both stages | api, shared, web, desktop | [README](modules/dictionary/README.md) |
| styles | Built-in and custom styles, per-app rules with paste keystroke | api, shared, web, desktop | [README](modules/styles/README.md) |
| desktop | Tray app: hold-to-talk, record, paste, overlay, updater | desktop | [README](modules/desktop/README.md) |
| mobile | Expo app: hold-to-talk, copy or share, style picker | mobile | [README](modules/mobile/README.md) |
| infra | AWS account, environments, Terraform, CI/CD | infra | [README](modules/infra/README.md) |

## Environments and delivery

- Base branch `develop`; `main` is production.
- Every change arrives by pull request into `develop`; merging deploys dev (`dev.takemyword.fless.dev`) and opens the promotion PR `develop -> main`, which deploys prd (`takemyword.fless.dev`).
- AWS account `takemyword` (115891590483), regions us-east-1 and us-east-2 only, budget 5 USD per month.

## Conventions

- Ports and adapters: the dictation pipeline calls a Transcriber port and a Refiner port; each provider is one adapter chosen per request. Example: `apps/api/src/dictation/providers/`.
- Contracts first: every request and response is a zod schema in `packages/shared`, imported by every client. Example: `packages/shared/src/dictations.ts`.
- One docs commit per task on `develop`; module docs are updated by the task that changes the module.
- Each full sentence of a Markdown file on its own line; no em dash; no code comments.

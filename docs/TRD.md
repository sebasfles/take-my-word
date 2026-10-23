---
updated: 2026-10-23
source: 0014_desktop_ux
---

# Technical Requirements Document

Describes the whole application as it is built today; planned parts say so in their section.
One public monorepo, `sebasfles/take-my-word`, holds every app, the infrastructure and these docs.
Built and deployed to dev and prd: `apps/api`, `apps/web`, `packages/shared`, `infra`; released on Windows through GitHub Releases: `apps/desktop`; planned: `apps/mobile`.

## Components

| Component | Kind | Path | Base branch | Stack |
|---|---|---|---|---|
| api | app | `apps/api` | `develop` | Node 24, Hono on Lambda (ARM64, esbuild), zod |
| web | app | `apps/web` | `develop` | Next.js App Router, OpenNext on Lambda plus CloudFront |
| desktop | app | `apps/desktop` | `develop` | Tauri 2 (Rust shell), React + TypeScript UI |
| mobile | app | `apps/mobile` | `develop` | Expo managed workflow, EAS Build, Submit and Update |
| shared | package | `packages/shared` | `develop` | TypeScript, zod contracts shared by api, web, desktop and mobile |
| brand | package | `packages/brand` | `develop` | TypeScript and plain CSS: tokens, fonts, assets and primitives shared by web and desktop |
| infra | code | `infra` | `develop` | Terraform, AWS provider |

Package manager: pnpm workspace at the root; Node version pinned in `.nvmrc`.

### api

- Stack: Node 24, Hono, zod, AWS SDK v3; bundled with esbuild into two Lambdas, `api` (every CRUD route) and `dictate` (`POST /dictations`, more memory, 60 s timeout), plus `dictionary-usage` on the table stream and the Lambda authorizer.
- Layout: one folder per Lambda entry (`api/`, `dictate/`, `authorizer/`, `dictionary-usage/`) and one per module (`dictation/`, `dictionary/`, `styles/`, `app-rules/`, `settings/`, `history/`), provider adapters under `dictation/providers/`, shared helpers in `lib/`.
- Install: `pnpm install --frozen-lockfile` at the root.
- Workspace files: `.env` at the repository root, gitignored, never committed or printed.
  It holds `GROQ_API_KEY` and `OPENAI_API_KEY` (copied into the providers secret), `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` and `GITHUB_APP_PEM` (read by `infra/scripts/tf`), and `USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `CREW_E2E_USERNAME`, `CREW_E2E_PASSWORD`, `CREW_E2E_B_USERNAME`, `CREW_E2E_B_PASSWORD`, `TABLE_NAME` and `API_URL` (read by `pnpm token` and `pnpm e2e` in `apps/api`).
  `pnpm e2e` also needs the `fless-takemyword` AWS profile, for Polly speech and for resetting `crew-e2e-b`'s `SETTINGS` item.
- API spec: `none`; the zod contracts in `packages/shared` are the source of truth.
- Data: one DynamoDB table `take-my-word-{env}`, no ORM, no migrations; item kinds per module in each `database.md`.
- Delivery: GitHub Actions on `develop` (dev) and `main` (prd) build and run `aws lambda update-function-code`; see [infra](modules/infra/README.md).

### web

- Stack: Next.js 16 App Router, React 19, TypeScript, plain CSS; built with OpenNext 4 (incremental and tag caches off, images unoptimized), served by a Lambda Function URL behind CloudFront; Next.js and OpenNext pinned.
- Layout: `src/app` (landing, `sign-in`, `app` for the account, `api` for the route handlers), `src/lib` (session, auth flows, handlers, `es` and `en` dictionaries, API client), `src/components`; `public/static/` is the only public folder; `integration/` and `e2e/` run against dev.
- Install: root `pnpm install --frozen-lockfile`; `pnpm exec playwright install chromium` for e2e and screenshots.
- Workspace files: the root `.env` (`USER_POOL_ID`, `USER_POOL_CLIENT_ID`, `API_URL`, `CREW_E2E_*`, `TABLE_NAME`) and the `fless-takemyword` profile for `pnpm integration` and `pnpm e2e`, which create, seed (Polly speech) and delete throwaway users; `pnpm screenshots` mocks the API and needs none.
- Delivery: `reusable-deploy-web` on the same pushes as api, gated per job; static assets to S3, code to the Lambda, CloudFront invalidation; see [infra](modules/infra/trd.md).

### desktop

- Stack: Tauri 2 with Rust for the OS layer (a native `WH_KEYBOARD_LL` key hook on Windows, macOS and Linux in phase 5; `cpal` recording, `enigo` paste, active window, keychain) and React + TypeScript for the settings window and overlay.
- Layout: `src/` (UI), `src-tauri/` (Rust shell and plugins).
- Install: root `pnpm install --frozen-lockfile`, Rust toolchain via `rustup`, platform prerequisites of Tauri 2.
- Workspace files: none to build; dev and prd API URLs and pool ids are public and committed, and `pnpm tauri:build:dev` or `pnpm tauri:build:prd` picks one at build time.
  The root `.env` keeps `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, the updater key that `desktop-release` reads from Actions secrets; only the prd config carries the updater.
- Delivery: `pnpm release:desktop X.Y.Z` bumps the version, tags `desktop-vX.Y.Z` with the notes and pushes; `desktop-release` builds the prd installer with `tauri-action`, verifies `latest.json` against the committed public key and publishes the GitHub Release as latest, with the installer also under `take-my-word-windows-x64-setup.exe` for the landing.
  The first tag, `desktop-v0.1.0`, was made by hand; never rewrite at or below a pushed tag.
  The installer is not code-signed, so SmartScreen warns on first install; Windows first, macOS and Linux in phase 5.

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
Each app's first task sets its commands; until then they are `unknown`.
Desktop `rust:*` scripts run from WSL: `apps/desktop/scripts/windows.sh` mirrors the worktree to `C:\dev\take-my-word` (override with `TMW_WINDOWS_CHECKOUT`), records the commit in `.synced-commit` there, and runs cargo through `powershell.exe` with its exit code; the Windows host needs rustup (MSVC), Visual Studio Build Tools with the C++ workload, Node 24 and pnpm on the user `Path`.
Locally the real-clipboard test is ignored; `desktop-ci` runs every desktop check on windows-latest with `--include-ignored`, uploads the dev NSIS installer as an artifact, and runs clippy on Ubuntu so non-Windows builds keep compiling. `pnpm screenshots <dir>` in `apps/desktop` renders every view state with a mocked Tauri bridge at 390, 768 and 1280 px.

| Target | Path | lint | typecheck | unit | e2e |
|---|---|---|---|---|---|
| api | `apps/api` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | `pnpm e2e` (vitest against `API_URL` of the workspace `.env`, `--no-file-parallelism`) |
| web | `apps/web` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | `pnpm integration` (vitest against the dev pool and `API_URL` of the workspace `.env`, with the `fless-takemyword` profile for a throwaway user, `--no-file-parallelism`), then `pnpm e2e` (Playwright against `WEB_URL`, dev by default, with the `fless-takemyword` profile and `TABLE_NAME` for throwaway users, `--workers=1`) |
| desktop | `apps/desktop` | `pnpm lint && pnpm rust:lint` (prettier, eslint, cargo fmt, clippy on all targets and on release with `--features dev` on Windows, then `rust:lint:linux`: the UI built and `linux-check`'s clippy in an `ubuntu:24.04` container with its apt packages) | `pnpm typecheck` | `pnpm test && pnpm rust:test` (vitest `--no-file-parallelism`, cargo `--test-threads=1`) | n/a |
| mobile | `apps/mobile` | unknown | unknown | unknown | n/a |
| cognito | `packages/cognito` | `pnpm lint` | `pnpm typecheck` | n/a | n/a |
| shared | `packages/shared` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | n/a |
| brand | `packages/brand` | `pnpm lint` | `pnpm typecheck` | `pnpm test` (vitest, `--no-file-parallelism`) | n/a |
| infra | `infra` | `terraform fmt -check -recursive` | `terraform -chdir=environments/{core,dev,prd} validate`, after `init -backend=false` on a fresh clone | n/a | n/a |
| workflows | `.` | `pnpm lint:workflows` (actionlint) | n/a | n/a | n/a |

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

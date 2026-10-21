# Take My Word

Personal voice-to-text dictation: hold a key, speak, release, and clean text lands in the focused app.

## Where things are

- Product, technical and architecture docs live in `docs/`. Start with `docs/TRD.md` for stack and commands, `docs/PRD.md` for what the product does, `docs/ARD.md` for decisions and debt.
- Each module has its own folder in `docs/modules/{{module}}/` with `README.md`, `prd.md`, `trd.md`, `ard.md`, `database.md` and optionally `flows.md`.
- Tasks live in `docs/tasks/`; drafts in `docs/tasks/_drafts/` are not tracked.
- Code is a pnpm monorepo: `apps/api`, `apps/web`, `apps/desktop`, `apps/mobile`, `packages/shared`, `infra/`.

## Read before working

1. This file.
2. `docs/TRD.md` and `docs/PRD.md`.
3. Only the module you are about to touch.

## Rules

- Base branch: `develop`; `main` is production.
- Run tests one at a time with `--runInBand`; see the Verification section of `docs/TRD.md`.
- Every request and response contract lives in `packages/shared` and is imported by every client; never duplicate a schema in an app.
- Terraform is applied only from Sebastian's machine; CI only swaps Lambda code.
- Audio is never persisted anywhere; only dictation text, for 90 days.

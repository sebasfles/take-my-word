---
id: "0018"
title: fast_providers_eval
type: feature
crew: pair
clearance: full
branch: feat/0018_fast_providers_eval
modules: [dictation, infra]
repos: ["."]
phases: 0
depends_on: ["0017"]
ticket:
created: 2026-10-24
updated: 2026-10-24
---

# 0018 Evaluation harness, round 2: Parakeet and Cerebras

## Goal

Round 2 of the evaluation harness built in 0017.
It measures Parakeet TDT 0.6B v3 on Together as transcriber and Cerebras models as cleaners against today's pipeline, with the same fixtures, gates and reports, so the fastest combination that passes quality can be chosen.
Production is not changed; switching providers is a later task that reads this report.

## Scope

- Infra: `TOGETHER_API_KEY` and `CEREBRAS_API_KEY` added to `placeholder_keys` in `infra/stacks/app/secrets.tf`; values are written outside Terraform.
- Adapters behind the existing ports, evaluation only, production configuration unchanged:
  - Transcriber `together-parakeet` (batch, `nvidia/parakeet-tdt-0.6b-v3`); it takes no prompt, so the dictionary rests on cleanup.
  - Refiner `cerebras-chat` (chat completions); Cerebras serves `qwen-3.8-27b` and `gpt-oss-120b` (model list, 2026-10-24), with reasoning off or lowest.
- Together also serves `openai/whisper-large-v3`; it joins as a candidate only if it is free to add (same adapter).
- Long samples (30 to 120 s, es, en and mixed) join the fixtures; 0019 reuses them.
- Runs:
  - Suite 1 transcription with Parakeet added; hard gate (invented text on noise, language and script) and relative gate as in 0017.
  - Suite 2 cleanup with Cerebras candidates added, plus `gpt-oss-20b@low` (Groq) re-run on real transcripts of Parakeet and `gpt-transcribe`.
  - Summary and end-to-end with the best new combinations.
- Dated prices and plans for Together and Cerebras in `prices.ts`; each run states its estimated spend first and stops above its cap.

## Out of scope

- Switching production providers (its own task, after this report).
- Segmented transcription (0019) and surrounding context (draft `surrounding_context`).
- Streaming or realtime transcription.
- Deferred: keep-alive and a warm `dictate` (draft `latency`).

## Acceptance

1. `together-parakeet` and `cerebras-chat` exist behind the Transcriber and Refiner ports, are selectable by the eval runner, and leave production calls byte-identical (unit tests).
2. `placeholder_keys` names `TOGETHER_API_KEY` and `CEREBRAS_API_KEY`; the eval Lambda reads both from the providers secret.
3. Long samples (30 to 120 s) in es, en and mixed exist in the frozen fixtures, with expected text and terms.
4. Suite 1 and suite 2 reports include the new candidates with every 0017 metric, both gates, P50 and P95 latency, and cost; long samples are reported as their own bucket.
5. The summary ranks every combination that passes both gates by release-to-text latency, with cost per heavy and light month.
6. No run spends more than 3 USD, and no run leaves the Together or Cerebras balance under 5 USD.
7. `report.md` recommends a combination, with the evidence and what the production switch would need.

## Approach

- Module and layers touched: dictation providers and the evaluation runner in `apps/api`; infra secret keys.
- Entities, endpoints, tables: none new; same eval Lambda and results layout as 0017.
- Decisions:
  - Budget: 3 USD per run as 0017, plus a floor of 5 USD on each prepaid balance (15 USD each), chosen over the 0017 cap alone because prepaid credit has no free allowance to fall back on.
  - Long samples here rather than in 0019: chosen because both tasks need them and this one owns the fixtures.
  - Keys written in `take-my-word-dev/providers` and `take-my-word-prd/providers` on 2026-10-24; the Terraform change only names them for new environments, since the secret version ignores value changes.

## Database

None.

## Infra

- `infra/stacks/app/secrets.tf`: two keys added to `placeholder_keys`; applied locally, not in CI; no value in code.
- Dev eval Lambda as in 0017.

## Design

None.

## Risks

- Parakeet takes no vocabulary prompt; term errors may rise and must be judged after cleanup.
- Parakeet v3 may answer quiet audio in the wrong script; the hard gate must catch it.
- Cerebras and Together rate limits and availability are unmeasured; the runner reads their headers and paces as with Groq.
- Groq's 20 transcriptions per minute are account-wide and shared with production; pacing stays as in 0017.

## Depends on

0017 (merged).

## Context & decisions

Consolidated 2026-10-24 by the om-reviewer; answers from the om-manager.

- Suite 1 candidates (om-manager): `whisper-large-v3-turbo` (baseline), `gpt-transcribe`, `together-parakeet`, and Together `openai/whisper-large-v3` if the same adapter covers it with only the model; Groq `whisper-large-v3`, `gpt-4o-mini-transcribe` and `gpt-4o-transcribe` are not re-run (0017 hard-gate failures, retiring 2027-02-26) and the report cites 0017 for them. Why: all five plus the new ones exceed the 3 USD cap with the long samples.
- Judging a prompt-less transcriber (om-manager), adjusting Scope "Suite 2" and Acceptance 5: suite 1 reports raw term errors, but term errors gate only after cleanup. Suite 2 adds chained cases: the raws turbo, `gpt-transcribe` and Parakeet produced in suite 1 (first run, one voice per case, the case's own language, long cases included, deduplicated), with that case's expected text and terms plus hand-written required and forbidden words; the om-reviewer reviews them before they are frozen. Every suite 2 candidate runs on 0017's 33 cases plus these; a combination's term errors and meaning changes come from the cleanup of its own transcriber's raws, compared with turbo plus `gpt-5.4-nano` (production call) on turbo's raws.
- Suite 2 candidates (om-reviewer): `gpt-5.4-nano` production call (baseline), `gpt-5.4-nano@none`, `gpt-5.6-luna@none`, Cerebras `qwen-3.8-27b` at `reasoning_effort` none and `gpt-oss-120b` at low (its lowest), Groq `gpt-oss-20b@low`; temperature 0 on all but the baseline; production's `refinerInstructions` unchanged, no per-model tuning. Groq 20b spans about two days at the 10K reserve.
- End to end (om-manager), adjusting Scope "Summary and end-to-end": production's `dictate()` (`apps/api/src/dictation/dictate.ts`) runs inside the eval Lambda with the candidate adapters and fake quota, store and profile, on the `endToEnd` cases and the long ones; release-to-text in the summary is that in-Lambda time plus the client-to-API overhead 0017's dev e2e measured, labelled as such. No dev API run in this task; the shared dev Lambdas and the API are untouched.
- Ranking (om-reviewer): combinations rank by release-to-text P50 on the connection a normal dictation gets (fresh, per 0017); P95 comes from the sum distribution, never a sum of P95s.
- Balances (om-manager): Together 15 USD and Cerebras 15 USD on 2026-10-24, used by nothing else during the task; dated constants in `prices.ts`; every Together and Cerebras call goes into the shared ledger at list price (Together per second as listed, assumption stated in the report); a call is refused when start minus spent minus its estimate would go under 5 USD. The 3 USD per run cap applies as in 0017, with suite 1 as one run.
- Groq sharing (om-manager): while 0019 may dictate on dev, Groq Whisper calls pace at a quarter of the per-minute limit (5 a minute); daily reserve stays at half, no `--whisper-daily-kept`; turbo's run may span two days.
- Infra (om-manager): `placeholder_keys` sits under `ignore_changes`; `pnpm tf dev plan` and `pnpm tf prd plan` must both show "No changes" and go in the PR as evidence; no apply anywhere.
- Long samples (om-reviewer): 2 per bucket (es, en, mixed), one about 45 s and one about 100 s, each with the bucket's two voices; every clip at most 4 MiB as production's cap; a distinct id prefix, since 0017's `long-*` ids are the 15 s dictations and stay unchanged; the long bucket passes both gates on its own and also counts in the totals; fixture commits precede measured results and are reviewed by the om-reviewer first.
- Hard gate (om-reviewer): also fails text in a non-Latin script and Latin text that reads as neither es nor en (`dominantLanguage` returns undefined on both today), with unit tests.
- Together adapter (om-reviewer): Parakeet gets no prompt, Together Whisper gets the fixture prompt; with several languages it sends `language=auto` (Together defaults to `en`) and takes the detected language from `verbose_json`, verified to be detected and not echoed; a smoke of each model through the eval Lambda comes first, and a model not served is reported as such.
- Production unchanged (om-reviewer): `transcriberIds`, `refinerIds`, the registry, `providerKeysSchema` in `apps/api/src/lib/secrets.ts` and selfhost's `providerKeys` stay as they are; if shared helpers change, unit tests pin `groq-whisper` and `openai` requests (URL, headers, body) byte for byte; `production-bundles.test.ts` keeps eval code out of the four bundles.
- Constraints: `docs/modules/dictation/ard.md` (ports and adapters, deterministic gates, pacing, eval contract in `apps/api`); reports in this task folder, raw JSON in the workspace; neutral wording, no personal names or whose account; key values are never read locally.
- Review beyond the Pipeline: tf plan evidence, fixture and chained-case commits before results, the balance floor and the cost guard tested, the gate tests above, the production byte-identity tests.
- Overhead samples (om-reviewer, before round 1): the client-to-API overhead (client time minus server total) of 0017's warm end-to-end dictations is read once, read-only, from 0017's workspace results and committed as a dated constant in `evaluation/harness` with its run and report as source; the summary sums it with the in-Lambda distribution. Why: a single P50 constant loses the P95 shape.
- Naming (om-reviewer, before round 1): one adapter `together-transcribe` serves both Together models, with eval candidates `together-parakeet` and `together-whisper-large-v3`; `cerebras-chat` shares a chat-completions helper with `groq-chat`, whose request a test pins. Acceptance 1's `together-parakeet` is the candidate id.
- Groq plan change (om-manager, 2026-10-24): the Groq organization moves to the paid Developer tier with a 5 USD monthly spend limit; from the om-manager's "groq paid", the free-plan daily reserves no longer apply, the paused suite 1 finishes at once pacing only on Groq's rate-limit headers, and the plan change and its date go into `prices.ts` and the reports. Groq calls from that date are charged at list price and count in the 3 USD run cap; the report states the task's Groq spend against the shared 5 USD limit (om-reviewer). Active 2026-10-24 (om-manager's "groq paid"): paid tier with 10 USD of credit as of 2026-10-24; the report states the Groq spend against that credit and the monthly limit.
- Work order while Groq Whisper waits (om-manager, 2026-10-24): what needs no Groq Whisper runs meanwhile; suite 2 still starts only after the om-reviewer has reviewed the chained cases.
- clearance: full: `pnpm tf dev plan` and `pnpm tf prd plan` only; code swap and invoke of the dev eval Lambda; Polly; provider calls through the eval Lambda with the Groq, OpenAI, Together and Cerebras keys of the dev providers secret. No dev API run, no change to shared dev Lambdas, no apply.

## om-developer notes

### Round 1

Done (code and suite 1 fixtures only; no measured run yet, so the fixtures are reviewed first):

- Infra: `TOGETHER_API_KEY` and `CEREBRAS_API_KEY` in `placeholder_keys`; `pnpm tf dev plan` and `pnpm tf prd plan` both "No changes", saved as `evidence/dev-plan-round1.txt` and `evidence/prd-plan-round1.txt` in the workspace; no apply.
- Adapters in `apps/api/src/dictation/providers/`: `together-transcribe` (one adapter for `nvidia/parakeet-tdt-0.6b-v3` and `openai/whisper-large-v3`; `prompted` decides whether the prompt is sent; with no requested language it sends `language=auto` and `verbose_json` and reads the detected language and `duration`), `cerebras-chat` and `groq-chat` on a shared `chat-completions.ts`.
  Tests pin `groq-whisper`, `openai` and `groq-chat` requests (URL, headers, form fields in order or body string); `transcriberIds`, `refinerIds`, the registry and `providerKeysSchema` are unchanged.
- Eval Lambda: its own key loader (`src/eval/keys.ts`, all four keys required) over a generic `cachedSecretJson` in `lib/secrets.ts`; a `dictate` request kind that runs production's `dictate()` with the candidate adapters, a fake quota, store and profile, no metrics and a silent logger; every call carries its `stage` and usage.
- Harness: dated Together and Cerebras prices (`checkedOn` 2026-10-24) and prepaid balances (15 USD each since 2026-10-24, floor 5 USD); the ledger records each call's charged USD; a call is refused when start minus the provider's ledger spend minus its estimate goes under the floor, and a run states each prepaid provider's estimate and refuses up front if it would cross the floor.
  Groq Whisper paces at a quarter of its per-minute limit (`minuteShare` 0.25, 5 a minute) for every run; daily reserve stays at half.
- Hard gate: "wrong language" also fails letters outside the Latin script and Latin text whose function words read as neither es nor en (pt, fr, it, de lists, words shared with es or en removed); a test keeps every committed expected text clear of it.
- Long samples: `extended-{es,en,mixed}-{45,100}` in `transcription.fixtures.json`, two voices each, measured 41 to 49 s and 87 to 106 s, at most 3.39 MB; `buildClip` refuses a clip over production's 4 MiB.
  Reports show them as their own bucket ("30 to 120 s"), which must pass the relative gate on its own; latency of the main tables uses clips under 30 s so it stays comparable with 0017.
- Suite 2: `pnpm eval:chain --transcription <dir>` writes `chained.fixtures.json` from suite 1's run 1 (first voice, one language, guard-dropped and failed raws left out, identical raws merged) with hand-written `chained-checks.json`; both still to come, after suite 1. `eval:cleanup` refuses to measure without chained cases; reports add per-transcriber and long buckets.
- `pnpm eval:dictate --combinations a+b,...`: production `dictate()` in the eval Lambda on the `endToEnd` and long cases, fresh connections, baseline pair always included, paced on both providers.
- `eval:summary [--dictate <dir>]`: ranks combinations passing every gate by release-to-text P50 (in-Lambda total plus 0017's client overhead as a distribution, `harness/client-overhead.ts`), with light and heavy month cost.
- Smoke through the dev eval Lambda: all four transcribers and six refiners answer; Together detected Spanish under `auto` in one call (not echoed); Together sent no rate-limit headers.

Decisions not in the plan:

- Candidate lists in `harness/candidates.ts` now hold round 2's candidates only; round 1's reports reproduce from their recorded commit, and `notRerun` cites 0017 for the dropped transcribers.
- The scheduler paces one item on two providers (`alsoPaced`, `alsoUsed`) for dictations.
- Together is billed per started second at its per-minute price (no minimum), stated in the summary.
- `providerCall.stage` is optional in the contract so 0017's stored results still type-check.
- `pnpm e2e` (dev API) is not run in verify, per this task's clearance.

Pending: suite 1 run after the fixture review; `chained-checks.json` and chained fixtures (review); suite 2; `eval:dictate`; summary; `report.md`.
Estimated: Groq turbo spans about two days at 5 a minute; Groq `gpt-oss-20b@low` needs about 3 days of its 10K-reserve allowance with the chained cases.

### Round 2

Applied all 6 findings of round 1:

1. Suite 1's relative gate checks WER and failed calls only; raw domain-term errors stay in the suite 1 report, labelled as gated after cleanup, and `combinationCleanupGate` on the transcriber's own raws is the only term gate; test: equal WER with more raw term errors passes.
2. The run cap checks the sum of every stage's estimate before a call; test: a second stage alone over the cap refuses the call before it runs.
3. Reported durations are billed per started second (`Math.ceil`) in both paths; test of the usage path.
4. Each overhead sample now adds that dictation's storage stages from the same 0017 run (the larger of quota and profile, plus save; 12 to 185 ms), which the eval Lambda fakes; the constant's meaning says so and the summary prints it.
5. The providers secret output names the four keys.
6. `extended-en-45` no longer lists "merged" as a term; the suite 1 fixtures freeze here.

`pnpm tf dev plan` and `pnpm tf prd plan` still "No changes" (`evidence/{dev,prd}-plan-round2.txt`); verify ran on 9f03767, the code of this round.

### Round 3

Applied the finding of round 2: rebased on `origin/develop` (1a77433) with no conflicts; rounds 1 and 2 are now d241e82 and 6e03bab, and verify ran on 6e03bab, the rebased code.
This round's commit holds only these notes and `verify.log`, so the verified commit stays in the branch's history.

### Round 4

Suite 1 measured on 6e03bab's frozen fixtures (`results/transcription-1` in the workspace): 3100 of 3120 calls, 1.48 USD charged, then paused by the Groq Whisper daily audio reserve until 2026-10-25T08:31Z; the 20 pending calls are all turbo run 5 (extended es and mixed under both languages, quiet-en-1, noise), none a run-1 one-language first-voice call, so the chained cases are complete.
The report is rendered when those calls land.

- `chained-checks.json`: hand-written required and forbidden words per speech case (36); required words leave out the case's dictionary terms, which the term check already measures, so one recognition error counts once.
- `chained.fixtures.json`: 98 cases from run 1 of turbo, gpt-transcribe and Parakeet (36 each, 7 raws shared by two or three transcribers).
- Tests: every chained case's expected texts pass its own checks; every speech case has checks its expected text passes.
- Failure rates count only provider failures (a message from an adapter label); the harness's own failed calls to the eval Lambda (two AWS signature errors from clock drift in this run, both retried) are listed apart in the reports, with a test.
- Groq paid plan, ready but off: `paidPlans` in `prices.ts` (empty); with a dated entry, Groq calls from that date get no free plan (no daily reserve, no quarter-minute pace; pacing by Groq's headers only), are charged at list price into the run cap, and every report states the task's Groq spend since then against the monthly limit; tests.
- `eval:dictate --smoke --combinations ...`: one end-to-end case through production's `dictate()` in the eval Lambda, no baseline forced; run with three non-Groq pairs, all ok.
- The 08:33Z resume is scheduled behind an STS check (`scripts/sts-check.sh` in the workspace) that leaves the run paused on stale credentials.

### Round 5

Applied the finding of round 4: no required or forbidden word contains one of its case's terms or translates one.
Changed: extended-en-100 "opened a PR" to "opened" and "not merge" to "do not"; extended-es-100 "menos clorofila" to "menos", forbidden "más clorofila" dropped (a bare "más" is in its own text, "más débil", so "menos" carries the check); extended-mixed-100 "después del launch" to "después", "pager" and "follow" dropped; long-mixed-1 forbidden "reunión inicial" and "presentación" dropped; dev-en-3 "not merge" to "not", forbidden "let's merge" dropped; dev-es-3 forbidden "hagamos merge ya" dropped (the last three also contained the term "merge").
`chained.fixtures.json` regenerated with `eval:chain` (98 cases); a test fails any check that contains one of its case's terms.
`eval:chain` now runs prettier on the file it writes, so a regenerated `chained.fixtures.json` passes lint as written.

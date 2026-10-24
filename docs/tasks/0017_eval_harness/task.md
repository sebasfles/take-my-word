---
id: "0017"
title: eval_harness
type: feature
crew: pair
clearance: full
branch: feat/0017_eval_harness
modules: [dictation, infra]
repos: ["."]
phases: 0
depends_on: []
ticket:
created: 2026-10-23
updated: 2026-10-23
---

# 0017 Evaluation harness, round 1: transcription and cleanup providers

## Goal

Choose the transcription and cleanup models with evidence, not intuition.
Round 1 measures, from inside AWS where dictation really runs, how accurate, how faithful and how fast each candidate is, separately for transcription and for cleanup, plus a short end-to-end check.
Quality is a gate; latency and cost are compared only among candidates that pass it.
The result is a report with a recommendation; switching production models is a later, separate task.

## Scope

- Two independent suites and one end-to-end guard:
  1. Transcription: fixed audio to raw text. Candidates: Groq `whisper-large-v3-turbo` (today) and `whisper-large-v3`; OpenAI `gpt-transcribe`, `gpt-4o-mini-transcribe` and `gpt-4o-transcribe` (batch only; `whisper-1` and `gpt-4o-mini-transcribe` retire on 2027-02-26 per OpenAI's notices, verify). Metrics: WER, domain-term errors, hallucinations on silence and quiet audio, language correctness (es, en, mixed es/en), latency (P50, P95), cost per minute.
  2. Cleanup: fixed raw transcripts to clean text, no audio. The raw inputs include real recognition errors captured from suite 1. Candidates: `gpt-5.4-nano` (today, deprecated by OpenAI), GPT-5.6 Luna, GPT-6 Luna (OpenAI); `gpt-oss-120b`, `gpt-oss-20b`, `llama-3.1-8b-instant` and `qwen/qwen3-32b` (if still served) on Groq. Metrics: meaning preserved (no added content, no changed verbs, as 0015 saw), filler removal, punctuation, dictionary terms applied, style followed (plain, casual, formal), latency (time to first token and total, P50 and P95), cost per dictation.
  3. End to end: a few sentences through the dev API with the current production pipeline, as a guard that the stages work together and to report the release-to-text time a user feels.
- Measurement runs inside AWS in the dev environment, us-east-1, so latencies match production: a dev-only evaluation entry point (for example a separate eval Lambda, or an eval mode that exists only in dev) that calls each provider adapter directly; never deployed to prd.
- Each case runs several times (at least 3, more for latency) to report medians and P95; cold and warm calls reported separately.
- Fixtures: sentences committed as text with expected outputs and expected terms; audio generated at run time with Polly neural voices (es, en, mixed), plus silence and quiet takes; no audio committed or persisted; no recordings of real users. Reuse and extend 0015's `pnpm eval:context` fixtures and machinery where it fits. The fixture set is frozen before the first measured run.
- New provider adapters only as far as the evaluation needs them (OpenAI transcription models and the extra Groq and OpenAI chat models) behind the existing Transcriber and Refiner ports; production configuration unchanged.
- Cost analysis in the report, per candidate and per combination (transcription plus cleanup), from measured audio seconds and tokens and dated list prices, never per request:
  - a normal dictation (about 15 seconds of speech);
  - a light month: 2 hours of audio;
  - a heavy month: 1 hour of audio per day (about 30 hours);
  - for each, the cost at list price and whether a provider's free allowance would cover it.
- Quality and speed next to cost in one summary table per combination, so a choice can be read in one place: quality gate passed or not, error rates, P50 and P95 latency, monthly cost in both scenarios.
- The report: a committed markdown report per run (tables per suite, per candidate), the raw results as JSON in the task workspace, and a recommendation section. Reruns reproducible with one command.
- Secrets: only the existing Groq and OpenAI keys; no new provider accounts.

## Out of scope

- Changing production models or prompts (a later task, based on this report).
- Providers that require a paid minimum or a paid plan (Together AI, Cerebras); only providers usable at no or near-zero cost are evaluated.
- The public metrics dashboard (later phase of the harness).
- Exact dictionary alias replacement and warm Lambdas (separate drafts).

## Acceptance

1. One command runs each suite against dev and writes the report; a second run on the same fixtures reproduces the quality numbers within noise.
2. The report covers every candidate in Scope, or says why one could not be measured (not served, error rates), with P50 and P95 latency measured inside us-east-1 and cost per minute or per dictation from dated list prices.
3. Quality gate cases (meaning changes, invented content, hallucinations on silence, wrong language) are flagged per candidate.
4. Nothing new runs in prd; dev returns to develop's code after the runs; throwaway users and their data are deleted.
5. `ci` green; lint, typecheck and unit tests for the new adapters and the runner.

## Approach

- Measure inside AWS, not from the laptop, because the laptop adds its own network to every number.
- Separate suites so one variable changes at a time.
- Direct provider APIs, not a router, so latency is the provider's own.

## Database

None (results in files, not DynamoDB, in round 1).

## Infra

Dev only: the evaluation entry point; Terraform applied to dev by the crew under the usual guard; nothing in prd. Cost of the runs: a few USD at most (Polly, provider calls).

## Design

None.

## Risks

- Provider rate limits can distort latency; the runner paces and records errors separately.
- Groq rate limits are per account and shared with production dictation: the runner reads Groq's rate-limit headers, paces itself, keeps at least half of every daily limit free for production, and stops and resumes the next day rather than exhausting it.
- Cost: the runner prints an estimated cost before each run and stops above 3 USD per run; if a provider would start charging beyond its free allowance, that provider's runs pause.
- Model availability changes (nano deprecated); the report dates every model and price.

## Depends on

None.

## Context & decisions

Consolidated 2026-10-23 by the om-reviewer; answers from the om-manager.

- Quality gate (om-manager): hard gate, any occurrence in any run fails, for content that would be pasted wrong: invented content, hallucinations that survive production's level and phrase guards (`apps/api/src/dictation/silence.ts`), wrong-language or translated output.
  Relative gate against today's `whisper-large-v3-turbo` plus `gpt-5.4-nano` for meaning changes (changed verbs, lost clauses), WER and domain-term errors: no worse beyond run-to-run spread.
  Today's models face the same hard gate; the report says so if they fail it.
- Judging (om-manager): deterministic per-case checks only (expected text with allowed variants, required verbs and words, forbidden words, exact dictionary spellings, filler list, style markers such as tú/usted and contractions); no LLM judge in round 1; every failing output is printed in the report.
- Cleanup settings (om-manager): `gpt-5.4-nano` exactly as production calls it is the baseline; every candidate, nano included, also runs at its lowest reasoning effort, temperature 0 where accepted; every candidate gets production's `refinerInstructions` unchanged, no per-model prompt tuning.
- Scope adjusted (om-manager): time to first token is dropped from round 1; cleanup latency is the total of the non-streamed call, as production makes it. Why: production pastes only the full text.
- Eval entry point (om-manager): a permanent dev-only eval Lambda behind an opt-in Terraform variable, off by default, never set by prd; no HTTP route, invoked synchronously with the deployment profile; its only permission is `secretsmanager:GetSecretValue` on the providers secret.
  The eval command builds and swaps its code from the checkout that runs it and records the commit in the report; CI, the deploy role, `pnpm deploy:api` and the four production bundles (`apps/api/scripts/build.ts`) stay untouched, so eval code never reaches prd.
  `pnpm tf prd plan` must show "No changes" and goes in the PR; no prd apply.
- Allowances (om-manager): Groq runs on its free plan; OpenAI has a small prepaid credit plus complimentary daily tokens on some small models; dev and prd share both providers' accounts and keys.
  The runner keeps half of each provider's daily allowance free for production, keeps plans, allowances and list prices as dated constants with their source, prints the estimated cost before each run and stops above 3 USD; it resumes the next day when a limit is reached.
- Dev (om-manager): the om-manager hands out dev; 0017 holds dev Terraform from its apply until the merge; the shared Lambdas never get branch code; `debug_audio` stays off during runs.
- Wording (om-manager): every file of this task states constraints neutrally, as task decisions, with no personal names and nothing about whose account or credit it is.
- Measurement (om-reviewer):
  - cold and warm are three numbers: Lambda cold start (end-to-end suite), provider call on a fresh connection, provider call on a reused connection; the report says which one a normal dictation pays today;
  - timing and rate-limit headers are taken inside the eval Lambda through the adapters' injectable `fetch` (`providers/http.ts`); existing adapters keep their behavior;
  - under both languages suite 1 wraps each candidate in production's `transcribeIn` (`language-selection.ts`), so retries count in cost and latency; the report states that a transcriber returning no detected language always transcribes twice;
  - every candidate gets the same audio bytes per case and run, the same `transcriberPrompt` from the fixture dictionary; at least two Polly neural voices per language.
- Cost (om-reviewer): monthly scenarios assume 15 s dictations (480 and 7200 per month) and apply Groq's 10 s billing minimum; combined P95 is never shown as a sum of P95s.
- Fixtures (om-reviewer): suite 2's raws are captured once from suite 1, committed and frozen before suite 2's first measured run; every fixture commit precedes its suite's first measured results and is reviewed by the om-reviewer first.
- Adapters (om-reviewer): new adapters live in `apps/api/src/dictation/providers/` behind the existing ports; `transcriberIds` and `refinerIds` in `packages/shared` and the production registry stay unchanged; the eval Lambda logs never carry audio, raw or clean text.
- Output (om-reviewer): this task's reports in this task folder; raw JSON in the workspace; one command per suite.
- Review checks beyond the Pipeline: prd plan "No changes" attached; fixture commits before results; nothing in the four production bundles imports eval code; unit tests for the new adapters, the metrics (WER, term errors, gate flags) and the pacing and cost guard; throwaway users deleted.
- clearance: full: `pnpm tf dev plan` and `apply` for the eval resources; `pnpm tf prd plan` only; code swap and invoke of the dev eval Lambda; Polly; provider calls with the existing keys; the end-to-end suite against dev with throwaway users deleted afterwards. No change to the shared dev Lambdas, no prd apply.
- Allowances adjusted (om-manager, 2026-10-23, during the cleanup run): Groq chat models (`gpt-oss-120b`, `gpt-oss-20b`), which production does not call, may use their daily token limit down to 10K tokens left instead of keeping half; Groq Whisper, which production calls, keeps the half reserve, as does every OpenAI allowance. Why: the reserve protects production, and production uses no Groq chat model; the cleanup run then finishes in one day when the limit allows, otherwise it carries over.
- Allowances adjusted (om-manager, 2026-10-23, for the transcription repeat's pending Groq calls and the cold-start end-to-end run only): Groq Whisper may go below its half daily reserve but keeps at least 10% of each daily limit (requests and audio seconds) free for production, and still paces at half of the per-minute limit, which is account-wide and shared with prd; OpenAI keeps half. Why: finish the reproduction and the cold-start numbers without waiting a day; the per-minute pace is what protects live dictations.

## om-developer notes

### Round 1

Done:

- Adapters behind the existing ports in `apps/api/src/dictation/providers/`: `openai-transcribe` (Transcriber; `languages[]` for `gpt-transcribe`, which also reports detected languages; the gpt-4o models report none) and `groq-chat` (Refiner, chat completions); `openai` gains optional `reasoningEffort` and `temperature`, unsent when unset, so production calls are unchanged; multipart audio and language-name mapping moved to `transcription-form.ts`, shared by both transcribers.
  `transcriberIds`, `refinerIds` and the production registry are unchanged.
- Eval Lambda in `apps/api/src/eval/`: zod contract (`warmup`, `transcribe`, `refine`), executor that wraps transcribers in production's `transcribeIn` and times every adapter call, and an instrumented fetch (userland undici) recording time to headers, status, new TLS connections (diagnostics channel `undici:client:connected`) and the `x-ratelimit-*`, `retry-after`, `x-groq-region` and `openai-processing-ms` headers.
  Fresh calls get a new Agent; reused calls ride a module-level kept-alive Agent; the handler loads the keys before any measured call and logs no audio or text.
  `production-bundles.test.ts` bundles the four production entries with esbuild and fails if any input comes from `src/eval`, `evaluation` or undici.
- Terraform: `eval_function` (default false) in `stacks/app`, validated to exist only in dev, wired through `environments/dev`; Lambda `<name>-dev-eval`, 1024 MB like `dictate`, 120 s, only `secretsmanager:GetSecretValue` on the providers secret; output `eval_function_name`.
  Applied to dev with `-var=eval_function=true` (5 added); `pnpm tf prd plan` shows "No changes", saved as `evidence/prd-plan-round1.txt` in the workspace.
- Runner in `apps/api/evaluation/`: `pnpm eval:transcription --results <dir> --report <md> [--runs 5] | --smoke` and `pnpm eval:e2e --results <dir> --report <md>`; harness modules for dated prices, plans and sources (`prices.ts`), candidates, metrics (WER with alignment, term errors, invented runs, known hallucination phrases, dominant language, percentiles, sum distribution), Polly voices and seeded noise, build and swap of the eval Lambda, pacing and cost guard, resumable JSONL results, analysis and report.
  The command refuses uncommitted fixtures or evaluation code, records the last commit touching `apps/api` and the fixtures' sha256, and refuses to resume a results directory of other fixtures, code or run count.
- Suite 1 fixtures `evaluation/transcription.fixtures.json`: 0015's 20 sentences, 5 mixed es/en, 3 dictations of about 15 s, 2 quiet takes at -46 dBFS, 3 noise takes (-53, -45, -30 dBFS) under each language; voices Lupe and Andres (es), Joanna and Matthew (en), Pedro and Mia (mixed); 66 clips; two fixture dictionaries feed the transcriber prompt through production's `transcriberPrompt` (153 and 166 bytes, under the 224 budget).
  End-to-end cases are the six marked `endToEnd` in the same file.
- `eval:context` (0015) now uses the shared throwaway user and word matching.
- Smoke (non-fixture sentence) through dev: all 5 transcribers and all 10 cleanup settings answer from us-east-1.

Decisions not in the plan:

- Model facts checked 2026-10-23 against the providers: `llama-3.1-8b-instant` (shut down on Groq 2026-08-16) and `qwen/qwen3-32b` (2026-07-17) are not served; the report lists them as not measured with the source. `gpt-4o-transcribe` also retires on 2027-02-26, with `whisper-1` and `gpt-4o-mini-transcribe`; `gpt-5.4-nano` retires 2027-04-01.
- Lowest effort, probed: `none` with temperature 0 for the three OpenAI models (temperature is refused at any other effort), `low` with temperature 0 for gpt-oss (Groq refuses `none`). As production calls them: nano runs at `none` by default, both Luna models at `medium`, gpt-oss at Groq's default.
- "both" sends `["es", "en"]` for every case, as a Spanish-first user's settings would, matching 0015.
- Runs: 5 per clip and language setting; run 1 asks for a fresh connection, later runs reuse; latency is grouped by the connection the call actually got.
- Hard gate per result, only on text that survives production's level and phrase guards: 3 or more inserted words in a row, a known hallucination phrase not in the expected text, or text whose function words read as the other language; any text on noise that survives the guards is a hallucination. Relative gate: WER and term-error rate per language setting no worse than `whisper-large-v3-turbo` plus the spread of its per-run values. Failed calls count as errors, not as WER.
- Pacing: per model key, the runner keeps half of every plan limit (per minute, per hour of audio, per day) from its own ledger, shared by sibling results directories, and pauses a Groq model for the day when its daily requests header drops under half; OpenAI's complimentary small-model group is taken at its lowest tier, 2.5M tokens a day. Budget: OpenAI and Polly at list price, Groq at zero on its free plan, 3 USD per run.
- The eval request contract lives in `apps/api/src/eval/contract.ts`: only the runner and the eval Lambda use it, both in `apps/api`, so it is not a client contract for `packages/shared`.
- `defaultSttPromptTokenBudget` is exported from `dictate/config.ts` so the fixtures use production's default.
- undici reuses a socket only a tick after the body is read, so production's back-to-back retranscription in `transcribeIn` can open a second connection; the harness measures that as it happens.

Pending: suite 1 measured runs after the fixture review; capture of suite 2 raws from them, the cleanup runner and its fixtures; end-to-end run; summary with cost per combination and recommendation.

Deferred: `qwen/qwen3.8-27b` is served on Groq (preview, 0.80/4.00 USD per million tokens) but is not in Scope.

### Round 2

Applied all 7 findings of round 1:

1. `evalFunction` in `deployment.json` (default false, documented in `deployment.example.json` and the generated schema, refused without the dev environment); `pnpm tf` passes `TF_VAR_eval_function` to dev only, never to prd or core; unit test in `packages/deployment`.
   The workspace copy of `deployment.json` has `"evalFunction": true`, and `pnpm tf dev plan` without any flag shows "No changes"; the official `deployment.json` in the root checkout needs the same key before its next dev apply, or that apply removes the Lambda (I do not touch the main clone).
2. The cost guard starts from what the results directory already recorded as charged, results and failed attempts alike; failures now record their `chargedUsd`.
3. `Transcript` carries an optional `usage` (seconds or input and output tokens) that production ignores; `openai-transcribe` returns it and tolerates an unknown usage shape; the eval response carries it per call.
   Pricing: `gpt-4o-transcribe` 2.50 / 10.00 and `gpt-4o-mini-transcribe` 1.25 / 5.00 USD per 1M audio tokens in / out (model pages, 2026-10-23); `gpt-transcribe` reports `usage.seconds` and is billed by duration like Groq; a per-minute estimate is used only before a call, for the budget.
   Results keep `listUsd` and `chargedUsd` (Groq charged 0 on its free plan); the report prices a 15 s dictation for token-billed models from their measured cost per audio second.
4. An item that exhausts its retries is stored as a failed result; the relative gate also fails a failure rate (failed attempts over attempts, 429s apart and reported separately) above the baseline's plus its per-run spread, per language setting.
   Production does not retry, so every failed attempt counts.
5. Speech dropped by the silence guard is scored as an empty hypothesis.
6. Each clip's sha256 goes into the run's `meta.json`; a resume with different audio is refused. Polly returned identical bytes on three calls for the same text and voice.
7. `long-en-1` gets the "2 days" variant; WER splits hyphenated words, term checks stay as written.

`pnpm tf prd plan` still "No changes" (`evidence/prd-plan-round2.txt`).

### Round 3

Suite 1 measured (`reports/transcription-1.md`, raw results in the workspace `results/transcription-1/`): fixtures and code of c100ccf, 3300 calls, 1.239 USD at list price, 0.955 USD charged, 1 failed attempt (a Groq turbo timeout at production's 10 s).

- Hard gate: only `gpt-transcribe` passes.
  Today's `whisper-large-v3-turbo` and `whisper-large-v3` invent short phrases on noise that survive production's guards ("and the other side of the screen.", "LAMBDA", "¿Qué es lo que se está haciendo?").
  Both gpt-4o models paste the whole transcriber prompt (the dictionary terms) on every noise take, and `gpt-4o-transcribe` translated an English sentence into Spanish in 7 of 10 runs, with the English hint too.
- WER: gpt-transcribe 0.5% (one) and 0.8% (both), gpt-4o-mini 0.7 and 0.8%, gpt-4o 1.1 and 1.5%, whisper-large-v3 2.8%, turbo 3.6%; domain-term errors 0.6%, 1.8%, 0.5%, 6.5%, 10.1%.
- Latency, reused connection, P50 / P95 under one language: turbo 336 / 642 ms, v3 367 / 772, gpt-transcribe 545 / 782, gpt-4o-mini 596 / 1600, gpt-4o 695 / 1048; the gpt-4o models report no language, so under both languages they always transcribe twice (about 1.3 to 1.5 s P50). Groq serves us-east-1 from yul and msp.
- Fixture error found after freezing: `long-es-1` says "cuando corre los tests"; every model writes the grammatical "corren". It costs every candidate the same word, so the comparison holds; left frozen.

Suite 2 built: `pnpm eval:cleanup --results <dir> --report <md> [--runs 3] | --smoke`, deterministic checks only, from `evaluation/cleanup.fixtures.json` (committed here, before any measured cleanup run):

- 33 cases: 13 raws captured from suite 1 (`pnpm eval:capture <results dir>` lists every distinct wrong raw; the 13 are hand-picked across dictionaries, languages and error kinds) and 20 written ones (fillers and repetitions, a self-correction, a question to someone else, a dictated instruction, negated commands, opposite clauses, casual and formal rewrites in both languages, mixed es/en both ways).
- Per output: invented content (a word, accents folded, in neither the raw, the expected texts nor the case's allowed words) and wrong language are the hard gate; meaning changes (a required word missing, a forbidden word present), dictionary terms exactly as written, fillers removed, punctuation (capital, closing mark, Spanish ¿ ?), style markers and exact match are measured; relative gate on meaning changes, term errors and failed calls against `gpt-5.4-nano` as production calls it.
  Every expected text of the fixtures passes all its own checks.
- 3 runs per case (Context minimum; latency samples are 99 per setting); the Groq models need about 160K tokens each against the 100K the runner may use per day, so the run spans two days by design.
- `pnpm eval:summary --transcription <dir> --cleanup <dir> --report <md>`: one table per language setting and combination with gates, WER, term errors, meaning changes, P50 / P95 of the sum over all sample pairs (fresh and reused), cost per 15 s dictation and per month (480 and 7200 dictations) at list price and charged, and why each free allowance covers or not.
- `openWorkspace` keeps credentials already in the environment instead of forcing the profile.

Blocked for the next measured runs: the deployment profile's SSO session expired at about 20:30 UTC; the CLI still holds role credentials until 23:32 UTC, which I passed to the smoke and the e2e verify, but the two-day cleanup run and the end-to-end suite need an interactive `aws sso login` on the profile before they start.

### Round 4

Applied all 4 findings of round 3:

1. Cleanup's hard gate on invented content is now a run of 3 or more consecutive words outside the raw, expected and allowed vocabulary, the definition of suite 1; single new words are listed per output and measured as the share of outputs with any, which joins the relative gate (no worse than the baseline plus its spread).
2. Commands resolve `--results` and `--report` from where pnpm was invoked (`INIT_CWD`) and print them relative to the repository root, so the printed command reproduces from the root; the e2e report names "the dev API" instead of its host.
   A finished run renders from its stored results with no provider or AWS call, keeping the code commit it was measured with; resuming pending calls still requires the same code and audio.
   `reports/transcription-1.md` is re-rendered that way: only the generation time and the reproduce line changed.
3. Before any eval swap or invoke and before the end-to-end suite, the runner checks the STS caller account against `aws.accountId` and refuses a mismatch (checked once per command).
4. `captured-dev-es-2` forbids "corrige" and "corrija".

Still pending for the measured cleanup and end-to-end runs: a fresh `aws sso login` on the deployment profile.

### Round 5

Measured and reported (`report.md` with the recommendation; `reports/cleanup-1.md`, `end-to-end-1.md`, `summary-1.md`, `reproduction-1.md`; raw results in the workspace `results/`):

- Cleanup: 990 calls, 0.063 USD charged; first day up to the Groq share, resumed the same evening under the 10K reserve.
  Only `gpt-5.4-nano` and `gpt-5.6-luna` at effort none pass both gates; the production call of nano made up numerals once ("a secto 193"), and `gpt-oss-120b` answered the dictated "ignore the previous instructions" with a refusal.
- End to end: 33 dictations, 0 failed, 1.8 / 2.7 s P50 / P95 release to text from this client; the paced run met warm Lambdas.
- Summary and recommendation: `gpt-transcribe` with `gpt-5.4-nano` at effort none and temperature 0 is the only cheap passing pair (about 8 USD charged in a heavy month, about 230 ms more at P50); `gpt-5.6-luna` at effort none is nano's successor.
- Reproduction: the second transcription run (3 runs) matches the first on every complete candidate; its 205 Groq calls resume after 2026-10-24 19:08 UTC.

Changes and decisions not in the plan:

- Daily free-plan limits are paced over a trailing 24 hours instead of the UTC day, since Groq replenishes on a rolling window; Groq's own request header now blocks until its reset instead of pausing the day. OpenAI's complimentary tokens stay on the UTC day, as OpenAI resets them.
- Groq chat models keep 10K of their daily tokens instead of half (`tokensPerDayKept`, the decision of Context & decisions); Whisper and every OpenAI allowance keep half, with a test.
- Resuming compares a digest of every planned request (audio by its hash) and the eval bundle's hash instead of the code commit; commits a run was resumed with are recorded in its meta and shown in its report.
  `cleanup-1` started before the digests existed: they were added to its meta while it was paused, after checking that `apps/api/src`, `packages/shared`, the lockfile, fixtures, candidates and `request()` were unchanged since its start (7492333).
- Incident: the first end-to-end attempt was not paced and sent dictations 1.6 s apart; 9 of 33 got 429 from turbo's 20 requests per minute at 21:28 UTC, on the account prd shares, for about a minute.
  The suite now paces through the shared pacer and ledger; the attempt's 33 requests went into the ledger and its results are kept apart (`results/end-to-end-0-unpaced`), out of the reports.
- The checks split words on em and en dashes and treat non-breaking hyphens as hyphens; re-rendered reports only lowered cleanup's new-word rates, with every gate unchanged.
- `pnpm eval:reproduce --first <dir> --second <dir> --report <md>` compares two transcription runs on the runs both have.
- `verify-task`'s api e2e also dictates on dev with turbo, outside the ledger; Groq's request header still guards the runner.

Pending: the second run's Groq calls and a cold-start end-to-end run after 2026-10-24 19:08 UTC, then re-rendering `reproduction-1.md` and `end-to-end-1.md`.

### Round 6

- `report.md`: Groq's 20 transcriptions per minute is account-wide (every user, dev and prd), named as a production risk for the switch task; the incident states that prd impact is not verified and how to check it.
- For `document-task`, dictation debt: production's transcriber shares one free-plan rate limit across every user and both environments, so concurrent users or a dev e2e run can make prd dictations fail with 429.
- `--whisper-daily-kept <fraction>` on `eval:transcription` and `eval:e2e`, opt-in and off by default (Context & decisions, second allowance entry): Groq Whisper's daily requests and audio seconds, in the ledger and in Groq's daily-requests header, keep that share free (at least 10%) instead of half; per-minute and hourly pacing, the Groq chat reserve and OpenAI's half are unchanged, with tests; runs record it in `overrides.jsonl` and their reports state it.
- Ran with `--whisper-daily-kept 0.1`: the cold-start end-to-end run (`reports/end-to-end-1.md`, 33 dictations, 0 failed, 3 cold with 559 / 592 ms `dictate` init; the earlier warm run is kept in the workspace `results/end-to-end-1-warm/`) and the second transcription run's last 200 Groq calls (`reports/transcription-2.md`).
- `reports/reproduction-1.md`: every candidate complete in both runs; the quality numbers reproduce (Whisper and gpt-transcribe identical WER, gpt-4o-mini within 0.2 points, gpt-4o-transcribe within its per-run spread).
- `report.md` re-rendered with those results; nothing pending.

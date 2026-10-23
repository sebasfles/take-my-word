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

## om-developer notes

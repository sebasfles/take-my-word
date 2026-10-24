# Transcription evaluation

Generated 2026-10-24T04:43:11.959Z from code commit `5a0005b8138bf880a3a97927db13bab6fe8cf92a`, resumed with `f53563d2e7e880502a2fa6e9461671447729ba12` and fixtures sha256 `94e990b5892d786e`.
Every provider call ran inside the dev eval Lambda `take-my-word-dev-eval` (us-east-1, 1024 MB, arm64), through the production adapters and production's `transcribeIn`, 3 runs per clip and language setting; run 1 opens a fresh connection, later runs reuse the Lambda's kept-alive one.
Clips are Polly neural speech generated at run time (voices Lupe, Andres, Joanna, Matthew, Pedro, Mia) and seeded noise; every candidate got the same bytes and the transcriber prompt of the case's fixture dictionary.
"one" sends the case's language; "both" lets the transcriber detect among es and en and transcribes again in es when it reports neither, as production does.
Prices and plans as checked on 2026-10-23; this run's calls cost 0.742 USD at list price, 0.572 USD charged (Groq on its free plan).
Override for part of this run: Groq Whisper daily limits kept 10% free for production instead of half (--whisper-daily-kept 0.1); per-minute and hourly pacing unchanged.
Reproduce from the repository root: `pnpm --filter @take-my-word/api eval:transcription --results ../results/transcription-2 --report docs/tasks/0017_eval_harness/reports/transcription-2.md --runs 3`.

## Candidates

| Candidate | Provider | List price | Retires | Hard gate | Relative gate |
|---|---|---|---|---|---|
| whisper-large-v3-turbo (today) | groq | 0.040 USD/h, 10 s minimum |  | FAIL | baseline |
| whisper-large-v3 | groq | 0.111 USD/h, 10 s minimum |  | FAIL | pass |
| gpt-transcribe | openai | 0.270 USD/h |  | pass | pass |
| gpt-4o-mini-transcribe | openai | 1.25 / 5 USD per 1M audio tokens in / out | 2027-02-26 | FAIL | pass |
| gpt-4o-transcribe | openai | 2.5 / 10 USD per 1M audio tokens in / out | 2027-02-26 | FAIL | pass |

Not measured:

- groq `llama-3.1-8b-instant`: shut down on Groq's free and developer plans on 2026-08-16 (Enterprise only); Groq names openai/gpt-oss-20b as its replacement ([source](https://console.groq.com/docs/deprecations)).
- groq `qwen/qwen3-32b`: shut down on Groq on 2026-07-17; Groq names openai/gpt-oss-120b as its replacement ([source](https://console.groq.com/docs/deprecations)).

## Quality gate

Hard gate, any occurrence fails: invented content (3 or more inserted words in a row), a known hallucination phrase or any text on noise that survives production's level and phrase guards, and text that reads as the other language.
Relative gate: WER and domain-term errors no worse than today's model plus its run-to-run spread, per language setting.

| Candidate | Invented content | Hallucination | Wrong language | Relative gate |
|---|---|---|---|---|
| whisper-large-v3-turbo | 0 | 36 | 0 | baseline |
| whisper-large-v3 | 0 | 27 | 0 | pass |
| gpt-transcribe | 0 | 0 | 0 | pass |
| gpt-4o-mini-transcribe | 0 | 36 | 0 | pass |
| gpt-4o-transcribe | 3 | 36 | 3 | pass |

## Accuracy

| Candidate | Languages | WER | WER per run | Domain-term errors | Language flips | Dropped by guard | Failed calls | Rate limited |
|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | one | 3.6% | 3.6%, 3.6%, 3.6% | 51/504 (10.1%) | 0/180 | 0 | 1/199 (0.5%) | 0 |
| whisper-large-v3-turbo | both | 3.6% | 3.6%, 3.6%, 3.6% | 51/504 (10.1%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| whisper-large-v3 | one | 2.8% | 2.8%, 2.8%, 2.8% | 33/504 (6.5%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| whisper-large-v3 | both | 2.8% | 2.8%, 2.8%, 2.8% | 33/504 (6.5%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-transcribe | one | 0.5% | 0.5%, 0.5%, 0.4% | 3/504 (0.6%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-transcribe | both | 0.8% | 0.9%, 0.7%, 0.9% | 6/504 (1.2%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-4o-mini-transcribe | one | 0.9% | 0.9%, 0.9%, 0.9% | 9/504 (1.8%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-4o-mini-transcribe | both | 0.9% | 0.9%, 0.9%, 1.1% | 10/504 (2.0%) | 72/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-4o-transcribe | one | 1.3% | 1.8%, 0.2%, 1.8% | 3/504 (0.6%) | 0/180 | 0 | 0/198 (0.0%) | 0 |
| gpt-4o-transcribe | both | 0.7% | 1.8%, 0.2%, 0.2% | 3/504 (0.6%) | 72/180 | 0 | 0/198 (0.0%) | 0 |

## Latency inside us-east-1

Per dictation: the sum of the transcriber calls `transcribeIn` made, measured in the eval Lambda around the adapter, as P50 / P95 (samples).
Fresh means the call opened a new TLS connection; reused means it rode a kept-alive one.

| Candidate | Languages | Fresh connection | Reused connection | ~15 s clips, reused | Calls per dictation | Groq region |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | one | 356 ms / 776 ms (67) | 352 ms / 745 ms (131) | 374 ms / 645 ms (12) | 1.00 | yul, msp |
| whisper-large-v3-turbo | both | 368 ms / 830 ms (67) | 306 ms / 647 ms (131) | 510 ms / 775 ms (12) | 1.00 | yul, msp |
| whisper-large-v3 | one | 447 ms / 879 ms (66) | 408 ms / 738 ms (132) | 447 ms / 699 ms (12) | 1.00 | yul, msp |
| whisper-large-v3 | both | 459 ms / 744 ms (66) | 303 ms / 719 ms (132) | 494 ms / 983 ms (12) | 1.05 | yul, msp |
| gpt-transcribe | one | 547 ms / 801 ms (67) | 507 ms / 770 ms (131) | 714 ms / 829 ms (12) | 1.00 |  |
| gpt-transcribe | both | 541 ms / 981 ms (66) | 546 ms / 981 ms (132) | 692 ms / 1094 ms (12) | 1.09 |  |
| gpt-4o-mini-transcribe | one | 516 ms / 703 ms (66) | 481 ms / 761 ms (132) | 569 ms / 640 ms (12) | 1.00 |  |
| gpt-4o-mini-transcribe | both | 1068 ms / 1455 ms (66) | 981 ms / 1506 ms (132) | 1091 ms / 1308 ms (12) | 2.00 |  |
| gpt-4o-transcribe | one | 790 ms / 1092 ms (66) | 691 ms / 1034 ms (132) | 922 ms / 1133 ms (12) | 1.00 |  |
| gpt-4o-transcribe | both | 1462 ms / 2158 ms (66) | 1419 ms / 1873 ms (132) | 1870 ms / 2092 ms (12) | 2.00 |  |

## Cost

Per 15 s dictation at list price, with each provider's billing minimum and the measured calls per dictation; a transcriber that reports no detected language always transcribes twice under both languages.

| Candidate | Billed by | Per minute | One language | Both languages |
|---|---|---|---|---|
| whisper-large-v3-turbo | duration | 0.00067 USD | 0.00017 USD | 0.00017 USD |
| whisper-large-v3 | duration | 0.00185 USD | 0.00046 USD | 0.00048 USD |
| gpt-transcribe | duration | 0.00450 USD | 0.00112 USD | 0.00123 USD |
| gpt-4o-mini-transcribe | measured audio and text tokens | 0.00319 USD | 0.00080 USD | 0.00160 USD |
| gpt-4o-transcribe | measured audio and text tokens | 0.00631 USD | 0.00158 USD | 0.00316 USD |

## Failed calls

- whisper-large-v3-turbo: groq-whisper:whisper-large-v3-turbo request failed: TimeoutError, 1 attempts

## Every output that differs from the expected text

Grouped per case, candidate and language setting; identical outputs are counted once, with their gate flags.

### dev-en-1

Expected: I opened a PR to fix the CI/CD pipeline, can you review it before the deploy?

- whisper-large-v3-turbo, one, 6x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, one, 3x: "I open a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-transcribe, one, 3x: "I opened a PR to fix the C slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, one, 3x: "I open a PR to fix the CI/CD pipeline. Can you review it before the deploy?"
- whisper-large-v3-turbo, both, 6x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, both, 3x: "I open a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-transcribe, both, 3x: "I opened a PR to fix the C slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 3x: "I open a PR to fix the CI/CD pipeline. Can you review it before the deploy?" (chose es)
- gpt-4o-transcribe, both, 6x: "I opened a PR to fix the CI/CD pipeline, can you review it before the deploy?" (chose es)
- whisper-large-v3, one, 3x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, both, 3x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 3x: "I opened a PR to fix the CI/CD pipeline. Can you review it before the deploy?" (chose es)

### dev-en-2

Expected: Run kubectl get pods in the staging namespace and send me the logs.

- gpt-4o-mini-transcribe, both, 6x: "Run kubectl get pods in the staging namespace and send me the logs." (chose es)
- gpt-4o-transcribe, both, 6x: "Run kubectl get pods in the staging namespace and send me the logs." (chose es)

### dev-en-3

Expected: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.

- whisper-large-v3-turbo, one, 3x: "The Terraform plan shows the Lamba will be replaced, so let's not merge yet" (missed Lambda)
- gpt-4o-mini-transcribe, both, 6x: "The Terraform plan shows the Lambda will be replaced, so let's not merge yet." (chose es)
- gpt-4o-transcribe, both, 6x: "The Terraform plan shows the Lambda will be replaced, so let's not merge yet." (chose es)
- whisper-large-v3-turbo, both, 3x: "The Terraform plan shows the Lamba will be replaced, so let's not merge yet" (missed Lambda)

### dev-en-4

Expected: Rebase on main, push the hotfix and tell me when the build is green.

- gpt-4o-mini-transcribe, both, 6x: "Rebase on main, push the hotfix, and tell me when the build is green." (chose es)
- gpt-4o-transcribe, both, 6x: "Rebase on main, push the hotfix and tell me when the build is green." (chose es)

### dev-es-1

Expected: Abrí un PR para arreglar el pipeline de CI/CD, ¿lo puedes revisar antes del deploy?

- whisper-large-v3-turbo, one, 6x: "Abrí un PR para arreglar el pipeline de CI-CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, one, 3x: "Abrí un PR para arreglar el pipeline de CI barra CD. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, one, 3x: "Abrí un PR para arreglar el pipeline de S barra C. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-transcribe, both, 3x: "Abrí un PR para arreglar el pipeline de Síbara CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 3x: "Abrí un PR para arreglar el pipeline de S barra C. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, one, 3x: "Abrí un PR para arreglar el pipeline de CI Diagonal CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3-turbo, both, 6x: "Abrí un PR para arreglar el pipeline de CI-CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, both, 3x: "Abrí un PR para arreglar el pipeline de CI barra CD. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, both, 3x: "Abrí un PR para arreglar el pipeline de CI Diagonal CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)

### dev-es-2

Expected: Corre kubectl get pods en el namespace de staging y mándame los logs.

- gpt-transcribe, both, 3x: "Corre kubectl get pods en el namespace de staging y mandame los logs."
- whisper-large-v3-turbo, one, 3x: "Core kubectl get pods en el namespace de staging y mándame los logs"
- whisper-large-v3-turbo, both, 3x: "Core kubectl get pods en el namespace de staging y mándame los logs"

### dev-es-3

Expected: El plan de Terraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía.

- whisper-large-v3-turbo, one, 6x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3, one, 3x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3-turbo, both, 6x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3, both, 3x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)

### bio-en-1

Expected: We transfected the HEK293 cells and ran a Western blot after forty-eight hours.

- gpt-4o-mini-transcribe, both, 3x: "We transfected the HEK293 cells and ran a Western blot after 48 hours." (chose es)
- gpt-4o-transcribe, both, 6x: "We transfected the HEK293 cells and ran a Western blot after 48 hours." (chose es)
- gpt-4o-mini-transcribe, both, 3x: "We transfected the HEK293 cells and ran a western blot after 48 hours." (chose es)

### bio-en-2

Expected: The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish.

- gpt-4o-mini-transcribe, both, 6x: "The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish." (chose es)
- gpt-4o-transcribe, both, 6x: "The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish." (chose es)

### bio-en-3

Expected: Run the qPCR with the new primers and normalize against GAPDH.

- whisper-large-v3-turbo, one, 3x: "Run the qPCR with the new primers and normalize against gapi" (missed GAPDH)
- whisper-large-v3, one, 3x: "Run the qPCR with the new primers and normalize against GAPE" (missed GAPDH)
- gpt-4o-mini-transcribe, both, 6x: "Run the qPCR with the new primers and normalize against GAPDH." (chose es)
- gpt-4o-transcribe, both, 6x: "Run the qPCR with the new primers and normalize against GAPDH." (chose es)
- whisper-large-v3-turbo, one, 3x: "Run the qPCR with the new primers and normalize against gapie" (missed GAPDH)
- whisper-large-v3, one, 3x: "Run the qPCR with the new primers and normalize against GAPE." (missed GAPDH)
- whisper-large-v3-turbo, both, 3x: "Run the qPCR with the new primers and normalize against gapi" (missed GAPDH)
- whisper-large-v3, both, 3x: "Run the qPCR with the new primers and normalize against GAPE" (missed GAPDH)
- whisper-large-v3, both, 3x: "Run the qPCR with the new primers and normalize against GAPE." (missed GAPDH)
- whisper-large-v3-turbo, both, 3x: "Run the qPCR with the new primers and normalize against gapie" (missed GAPDH)

### bio-en-4

Expected: The Arabidopsis thaliana mutants showed less chlorophyll under drought stress.

- gpt-4o-mini-transcribe, both, 6x: "The Arabidopsis thaliana mutants showed less chlorophyll under drought stress." (chose es)
- gpt-4o-transcribe, both, 6x: "The Arabidopsis thaliana mutants showed less chlorophyll under drought stress." (chose es)

### bio-es-1

Expected: Transfectamos las células HEK293 e hicimos un Western blot a las cuarenta y ocho horas.

- whisper-large-v3-turbo, one, 3x: "Transfectamos la célula a secto 193 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, one, 3x: "transfectamos la célula HEC293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3-turbo, one, 3x: "Transfectamos la célula SEC 293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3, one, 3x: "Transfectamos la célula SEC293 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, both, 3x: "transfectamos la célula HEC293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3-turbo, both, 3x: "Transfectamos la célula a secto 193 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, both, 3x: "Transfectamos la célula SEC293 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3-turbo, both, 3x: "Transfectamos la célula SEC 293 e hicimos un Western blot a las 48 horas" (missed HEK293)

### bio-es-2

Expected: El knockout con CRISPR-Cas9 redujo la expresión del gen p53 en el pez cebra.

- whisper-large-v3-turbo, one, 3x: "El knockout con CRISPR-Cas9 redujo la expresión del GMP53 en el pez cebra." (missed p53)
- whisper-large-v3-turbo, both, 3x: "El knockout con CRISPR-Cas9 redujo la expresión del GMP53 en el pez cebra." (missed p53)

### bio-es-3

Expected: Corre la qPCR con los nuevos primers y normaliza contra GAPDH.

- whisper-large-v3-turbo, one, 3x: "Corre la Coupé CR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, one, 3x: "Corre la qPCR con los nuevos primers y normaliza contra GAPY" (missed GAPDH)
- whisper-large-v3-turbo, one, 3x: "Corre la QPSR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, one, 3x: "Core la qPCR con los nuevos primers y normaliza contra GAPY." (missed GAPDH)
- whisper-large-v3-turbo, both, 3x: "Corre la Coupé CR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, both, 3x: "Corre la qPCR con los nuevos primers y normaliza contra GAPY" (missed GAPDH)
- whisper-large-v3-turbo, both, 3x: "Corre la QPSR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, both, 3x: "Core la qPCR con los nuevos primers y normaliza contra GAPY." (missed GAPDH)

### control-en-1

Expected: Let's meet tomorrow at three in the office, and bring the report.

- gpt-4o-mini-transcribe, both, 3x: "Let's meet tomorrow at 3 in the office and bring the report." (chose es)
- gpt-4o-transcribe, both, 2x: "Let's meet tomorrow at 3 in the office and bring the report." (chose es)
- gpt-4o-mini-transcribe, both, 3x: "Let's meet tomorrow at 3 in the office, and bring the report." (chose es)
- gpt-4o-transcribe, both, 4x: "Let's meet tomorrow at 3 in the office, and bring the report." (chose es)

### control-en-2

Expected: I'll call my mother after lunch to plan the weekend trip.

- gpt-4o-mini-transcribe, both, 6x: "I'll call my mother after lunch to plan the weekend trip." (chose es)
- gpt-4o-transcribe, both, 5x: "I'll call my mother after lunch to plan the weekend trip." (chose es)
- gpt-4o-transcribe, one, 1x: "Llamaré a mi madre después del almuerzo para planificar el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es)
- gpt-4o-transcribe, both, 1x: "Llamaré a mi madre después del almuerzo para planificar el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es; chose es)
- gpt-4o-transcribe, one, 1x: "Llamaré a mi madre después del almuerzo para planear el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es)

### control-es-2

Expected: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.

- gpt-transcribe, one, 2x: "Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana."
- gpt-transcribe, both, 2x: "Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana."

### mixed-3

Expected: El sprint termina el viernes, así que hagamos el standup a las nueve.

- gpt-4o-mini-transcribe, one, 3x: "El sprint termina el viernes, así que hagamos el stand-up a las 9." (missed standup)
- gpt-4o-mini-transcribe, both, 4x: "El sprint termina el viernes, así que hagamos el stand-up a las 9." (missed standup)

### long-es-1

Expected: Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corre los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

- whisper-large-v3-turbo, one, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge"
- whisper-large-v3, one, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-transcribe, one, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-mini-transcribe, one, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-transcribe, one, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-transcribe, both, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-mini-transcribe, both, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-transcribe, both, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- whisper-large-v3-turbo, both, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge"
- whisper-large-v3, both, 3x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."

### long-en-1

Expected: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.

- gpt-4o-mini-transcribe, both, 6x: "So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)
- gpt-4o-transcribe, both, 3x: "So I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)
- gpt-4o-transcribe, both, 3x: "So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)

### long-mixed-1

Expected: Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback.

- gpt-4o-mini-transcribe, one, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el DAC con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback." (missed deck)
- gpt-4o-mini-transcribe, both, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el DAC con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback." (missed deck)
- whisper-large-v3-turbo, one, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuartel y me lo mandes antes del viernes para darle feedback." (missed quarter)
- gpt-4o-transcribe, one, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuárter y me lo mandes antes del viernes para darle feedback." (missed quarter)
- gpt-4o-transcribe, both, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuárter y me lo mandes antes del viernes para darle feedback." (missed quarter)
- whisper-large-v3-turbo, both, 3x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuartel y me lo mandes antes del viernes para darle feedback." (missed quarter)

### quiet-en-1

Expected: Thank you, I already checked the report and it looks fine.

- gpt-4o-mini-transcribe, both, 3x: "Thank you. I already checked the report and it looks fine." (chose es)
- gpt-4o-transcribe, both, 3x: "Thank you. I already checked the report and it looks fine." (chose es)
- gpt-4o-mini-transcribe, both, 3x: "Thank you, I already checked the report and it looks fine." (chose es)
- gpt-4o-transcribe, both, 3x: "Thank you, I already checked the report and it looks fine." (chose es)

### noise-floor-es

Noise: white, -53 dBFS, 4 s

- whisper-large-v3-turbo, one, 3x: "and start up." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 3x: "LAMBDA" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "Thank you."

### noise-floor-en

Noise: white, -53 dBFS, 4 s

- whisper-large-v3-turbo, one, 3x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 3x: "Thank you."
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "Thank you."

### noise-room-es

Noise: brown, -45 dBFS, 4 s

- whisper-large-v3-turbo, one, 3x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 3x: "LAMBDA" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 2x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 1x: "context:" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "and more." (**hallucination**; text survives the level and phrase guards)

### noise-room-en

Noise: brown, -45 dBFS, 4 s

- whisper-large-v3-turbo, one, 3x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 3x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 2x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "context:" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 1x: "context:" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "and more." (**hallucination**; text survives the level and phrase guards)

### noise-loud-es

Noise: brown, -30 dBFS, 4 s

- whisper-large-v3, one, 3x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, one, 3x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)

### noise-loud-en

Noise: brown, -30 dBFS, 4 s

- whisper-large-v3-turbo, one, 3x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 3x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 3x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 3x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)


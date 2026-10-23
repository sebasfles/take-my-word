# Transcription evaluation

Generated 2026-10-23T20:53:31.902Z from code commit `c100ccf811981df9be63f044403ea01354db10bb` and fixtures sha256 `94e990b5892d786e`.
Every provider call ran inside the dev eval Lambda `take-my-word-dev-eval` (us-east-1, 1024 MB, arm64), through the production adapters and production's `transcribeIn`, 5 runs per clip and language setting; run 1 opens a fresh connection, later runs reuse the Lambda's kept-alive one.
Clips are Polly neural speech generated at run time (voices Lupe, Andres, Joanna, Matthew, Pedro, Mia) and seeded noise; every candidate got the same bytes and the transcriber prompt of the case's fixture dictionary.
"one" sends the case's language; "both" lets the transcriber detect among es and en and transcribes again in es when it reports neither, as production does.
Prices and plans as checked on 2026-10-23; this run's calls cost 1.239 USD at list price, 0.955 USD charged (Groq on its free plan).
Reproduce from the repository root: `pnpm --filter @take-my-word/api eval:transcription --results ../results/transcription-1 --report docs/tasks/0017_eval_harness/reports/transcription-1.md --runs 5`.

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
| whisper-large-v3-turbo | 0 | 60 | 0 | baseline |
| whisper-large-v3 | 0 | 45 | 0 | pass |
| gpt-transcribe | 0 | 0 | 0 | pass |
| gpt-4o-mini-transcribe | 0 | 60 | 0 | pass |
| gpt-4o-transcribe | 7 | 60 | 7 | pass |

## Accuracy

| Candidate | Languages | WER | WER per run | Domain-term errors | Language flips | Dropped by guard | Failed calls | Rate limited |
|---|---|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | one | 3.6% | 3.6%, 3.6%, 3.6%, 3.6%, 3.6% | 85/840 (10.1%) | 0/300 | 0 | 1/331 (0.3%) | 0 |
| whisper-large-v3-turbo | both | 3.6% | 3.6%, 3.6%, 3.6%, 3.6%, 3.6% | 85/840 (10.1%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| whisper-large-v3 | one | 2.8% | 2.8%, 2.8%, 2.8%, 2.8%, 2.8% | 55/840 (6.5%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| whisper-large-v3 | both | 2.8% | 2.8%, 2.8%, 2.8%, 2.8%, 2.8% | 55/840 (6.5%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-transcribe | one | 0.5% | 0.5%, 0.5%, 0.5%, 0.5%, 0.4% | 5/840 (0.6%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-transcribe | both | 0.8% | 0.6%, 0.9%, 0.9%, 0.9%, 0.9% | 9/840 (1.1%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-4o-mini-transcribe | one | 0.7% | 0.6%, 0.9%, 0.6%, 0.6%, 0.9% | 15/840 (1.8%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-4o-mini-transcribe | both | 0.8% | 0.9%, 0.6%, 0.6%, 0.6%, 1.1% | 16/840 (1.9%) | 120/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-4o-transcribe | one | 1.1% | 1.8%, 0.1%, 1.8%, 0.2%, 1.8% | 4/840 (0.5%) | 0/300 | 0 | 0/330 (0.0%) | 0 |
| gpt-4o-transcribe | both | 1.5% | 1.8%, 1.8%, 1.8%, 0.2%, 1.8% | 5/840 (0.6%) | 120/300 | 0 | 0/330 (0.0%) | 0 |

## Latency inside us-east-1

Per dictation: the sum of the transcriber calls `transcribeIn` made, measured in the eval Lambda around the adapter, as P50 / P95 (samples).
Fresh means the call opened a new TLS connection; reused means it rode a kept-alive one.

| Candidate | Languages | Fresh connection | Reused connection | ~15 s clips, reused | Calls per dictation | Groq region |
|---|---|---|---|---|---|---|
| whisper-large-v3-turbo | one | 385 ms / 946 ms (68) | 336 ms / 642 ms (262) | 474 ms / 1090 ms (24) | 1.00 | yul, msp |
| whisper-large-v3-turbo | both | 423 ms / 905 ms (66) | 335 ms / 769 ms (264) | 577 ms / 1082 ms (24) | 1.00 | yul, msp |
| whisper-large-v3 | one | 405 ms / 758 ms (66) | 367 ms / 772 ms (264) | 484 ms / 974 ms (24) | 1.00 | yul, msp |
| whisper-large-v3 | both | 418 ms / 759 ms (66) | 381 ms / 951 ms (264) | 598 ms / 1287 ms (24) | 1.05 | yul, msp |
| gpt-transcribe | one | 592 ms / 916 ms (67) | 545 ms / 782 ms (263) | 715 ms / 936 ms (24) | 1.00 |  |
| gpt-transcribe | both | 622 ms / 1079 ms (66) | 582 ms / 1077 ms (264) | 678 ms / 1481 ms (24) | 1.09 |  |
| gpt-4o-mini-transcribe | one | 740 ms / 2066 ms (66) | 596 ms / 1600 ms (264) | 758 ms / 2626 ms (24) | 1.00 |  |
| gpt-4o-mini-transcribe | both | 1524 ms / 3983 ms (66) | 1263 ms / 3190 ms (264) | 1565 ms / 3989 ms (24) | 2.00 |  |
| gpt-4o-transcribe | one | 742 ms / 1026 ms (66) | 695 ms / 1048 ms (264) | 999 ms / 1245 ms (24) | 1.00 |  |
| gpt-4o-transcribe | both | 1479 ms / 2120 ms (66) | 1443 ms / 2121 ms (264) | 2009 ms / 2458 ms (24) | 2.00 |  |

## Cost

Per 15 s dictation at list price, with each provider's billing minimum and the measured calls per dictation; a transcriber that reports no detected language always transcribes twice under both languages.

| Candidate | Billed by | Per minute | One language | Both languages |
|---|---|---|---|---|
| whisper-large-v3-turbo | duration | 0.00067 USD | 0.00017 USD | 0.00017 USD |
| whisper-large-v3 | duration | 0.00185 USD | 0.00046 USD | 0.00048 USD |
| gpt-transcribe | duration | 0.00450 USD | 0.00112 USD | 0.00123 USD |
| gpt-4o-mini-transcribe | measured audio and text tokens | 0.00319 USD | 0.00080 USD | 0.00160 USD |
| gpt-4o-transcribe | measured audio and text tokens | 0.00632 USD | 0.00158 USD | 0.00316 USD |

## Failed calls

- whisper-large-v3-turbo: groq-whisper:whisper-large-v3-turbo request failed: TimeoutError, 1 attempts

## Every output that differs from the expected text

Grouped per case, candidate and language setting; identical outputs are counted once, with their gate flags.

### dev-en-1

Expected: I opened a PR to fix the CI/CD pipeline, can you review it before the deploy?

- whisper-large-v3-turbo, one, 10x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, one, 5x: "I open a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-transcribe, one, 5x: "I opened a PR to fix the C slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, one, 5x: "I open a PR to fix the CI/CD pipeline. Can you review it before the deploy?"
- whisper-large-v3-turbo, both, 10x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, both, 5x: "I open a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-transcribe, both, 5x: "I opened a PR to fix the C slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 5x: "I open a PR to fix the CI/CD pipeline. Can you review it before the deploy?" (chose es)
- gpt-4o-transcribe, both, 10x: "I opened a PR to fix the CI/CD pipeline, can you review it before the deploy?" (chose es)
- whisper-large-v3, one, 5x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- whisper-large-v3, both, 5x: "I opened a PR to fix the CI slash CD pipeline, can you review it before the deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 5x: "I opened a PR to fix the CI/CD pipeline. Can you review it before the deploy?" (chose es)

### dev-en-2

Expected: Run kubectl get pods in the staging namespace and send me the logs.

- gpt-4o-mini-transcribe, both, 10x: "Run kubectl get pods in the staging namespace and send me the logs." (chose es)
- gpt-4o-transcribe, both, 10x: "Run kubectl get pods in the staging namespace and send me the logs." (chose es)

### dev-en-3

Expected: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.

- whisper-large-v3-turbo, one, 5x: "The Terraform plan shows the Lamba will be replaced, so let's not merge yet" (missed Lambda)
- gpt-4o-mini-transcribe, both, 10x: "The Terraform plan shows the Lambda will be replaced, so let's not merge yet." (chose es)
- gpt-4o-transcribe, both, 10x: "The Terraform plan shows the Lambda will be replaced, so let's not merge yet." (chose es)
- whisper-large-v3-turbo, both, 5x: "The Terraform plan shows the Lamba will be replaced, so let's not merge yet" (missed Lambda)

### dev-en-4

Expected: Rebase on main, push the hotfix and tell me when the build is green.

- gpt-4o-mini-transcribe, both, 10x: "Rebase on main, push the hotfix, and tell me when the build is green." (chose es)
- gpt-4o-transcribe, both, 10x: "Rebase on main, push the hotfix and tell me when the build is green." (chose es)

### dev-es-1

Expected: Abrí un PR para arreglar el pipeline de CI/CD, ¿lo puedes revisar antes del deploy?

- whisper-large-v3-turbo, one, 10x: "Abrí un PR para arreglar el pipeline de CI-CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, one, 5x: "Abrí un PR para arreglar el pipeline de CI barra CD. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, one, 3x: "Abrí un PR para arreglar el pipeline de SIBRZ. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 2x: "Abrí un PR para arreglar el pipeline de S barra C. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, both, 5x: "Abrí un PR para arreglar el pipeline de CI barra CD. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3-turbo, both, 10x: "Abrí un PR para arreglar el pipeline de CI-CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, one, 5x: "Abrí un PR para arreglar el pipeline de CI Diagonal CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- whisper-large-v3, both, 5x: "Abrí un PR para arreglar el pipeline de CI Diagonal CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, one, 2x: "Abrí un PR para arreglar el pipeline de S barra C. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-transcribe, both, 4x: "Abrí un PR para arreglar el pipeline de Síbara CD, ¿lo puedes revisar antes del deploy?" (missed CI/CD)
- gpt-4o-mini-transcribe, both, 3x: "Abrí un PR para arreglar el pipeline de SIBRZ. ¿Lo puedes revisar antes del deploy?" (missed CI/CD)

### dev-es-2

Expected: Corre kubectl get pods en el namespace de staging y mándame los logs.

- gpt-transcribe, both, 5x: "Corre kubectl get pods en el namespace de staging y mandame los logs."
- whisper-large-v3-turbo, one, 5x: "Core kubectl get pods en el namespace de staging y mándame los logs"
- whisper-large-v3-turbo, both, 5x: "Core kubectl get pods en el namespace de staging y mándame los logs"

### dev-es-3

Expected: El plan de Terraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía.

- whisper-large-v3-turbo, one, 10x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3, one, 5x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3-turbo, both, 10x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)
- whisper-large-v3, both, 5x: "El plan de Teraform dice que la Lambda se va a reemplazar, así que no hagamos merge todavía." (missed Terraform)

### bio-en-1

Expected: We transfected the HEK293 cells and ran a Western blot after forty-eight hours.

- gpt-4o-mini-transcribe, both, 6x: "We transfected the HEK293 cells and ran a Western blot after 48 hours." (chose es)
- gpt-4o-transcribe, both, 10x: "We transfected the HEK293 cells and ran a Western blot after 48 hours." (chose es)
- gpt-4o-mini-transcribe, both, 4x: "We transfected the HEK293 cells and ran a western blot after 48 hours." (chose es)

### bio-en-2

Expected: The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish.

- gpt-4o-mini-transcribe, both, 10x: "The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish." (chose es)
- gpt-4o-transcribe, both, 10x: "The CRISPR-Cas9 knockout reduced the expression of the p53 gene in zebrafish." (chose es)

### bio-en-3

Expected: Run the qPCR with the new primers and normalize against GAPDH.

- whisper-large-v3-turbo, one, 5x: "Run the qPCR with the new primers and normalize against gapi" (missed GAPDH)
- whisper-large-v3, one, 5x: "Run the qPCR with the new primers and normalize against GAPE" (missed GAPDH)
- gpt-4o-mini-transcribe, both, 10x: "Run the qPCR with the new primers and normalize against GAPDH." (chose es)
- gpt-4o-transcribe, both, 10x: "Run the qPCR with the new primers and normalize against GAPDH." (chose es)
- whisper-large-v3-turbo, one, 5x: "Run the qPCR with the new primers and normalize against gapie" (missed GAPDH)
- whisper-large-v3, one, 5x: "Run the qPCR with the new primers and normalize against GAPE." (missed GAPDH)
- whisper-large-v3, both, 5x: "Run the qPCR with the new primers and normalize against GAPE" (missed GAPDH)
- whisper-large-v3-turbo, both, 5x: "Run the qPCR with the new primers and normalize against gapi" (missed GAPDH)
- whisper-large-v3-turbo, both, 5x: "Run the qPCR with the new primers and normalize against gapie" (missed GAPDH)
- whisper-large-v3, both, 5x: "Run the qPCR with the new primers and normalize against GAPE." (missed GAPDH)

### bio-en-4

Expected: The Arabidopsis thaliana mutants showed less chlorophyll under drought stress.

- gpt-4o-mini-transcribe, both, 10x: "The Arabidopsis thaliana mutants showed less chlorophyll under drought stress." (chose es)
- gpt-4o-transcribe, both, 10x: "The Arabidopsis thaliana mutants showed less chlorophyll under drought stress." (chose es)

### bio-es-1

Expected: Transfectamos las células HEK293 e hicimos un Western blot a las cuarenta y ocho horas.

- whisper-large-v3-turbo, one, 5x: "Transfectamos la célula a secto 193 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, one, 5x: "transfectamos la célula HEC293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3-turbo, one, 5x: "Transfectamos la célula SEC 293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3, one, 5x: "Transfectamos la célula SEC293 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, both, 5x: "transfectamos la célula HEC293 e hicimos un Western blot a las 48 horas" (missed HEK293)
- whisper-large-v3-turbo, both, 5x: "Transfectamos la célula a secto 193 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3, both, 5x: "Transfectamos la célula SEC293 e hicimos un Western blot a las 48 horas." (missed HEK293)
- whisper-large-v3-turbo, both, 5x: "Transfectamos la célula SEC 293 e hicimos un Western blot a las 48 horas" (missed HEK293)

### bio-es-2

Expected: El knockout con CRISPR-Cas9 redujo la expresión del gen p53 en el pez cebra.

- whisper-large-v3-turbo, one, 5x: "El knockout con CRISPR-Cas9 redujo la expresión del GMP53 en el pez cebra." (missed p53)
- whisper-large-v3-turbo, both, 5x: "El knockout con CRISPR-Cas9 redujo la expresión del GMP53 en el pez cebra." (missed p53)

### bio-es-3

Expected: Corre la qPCR con los nuevos primers y normaliza contra GAPDH.

- whisper-large-v3-turbo, one, 5x: "Corre la Coupé CR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, one, 5x: "Corre la qPCR con los nuevos primers y normaliza contra GAPY" (missed GAPDH)
- whisper-large-v3-turbo, one, 5x: "Corre la QPSR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, one, 5x: "Core la qPCR con los nuevos primers y normaliza contra GAPY." (missed GAPDH)
- whisper-large-v3, both, 5x: "Corre la qPCR con los nuevos primers y normaliza contra GAPY" (missed GAPDH)
- whisper-large-v3-turbo, both, 5x: "Corre la Coupé CR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)
- whisper-large-v3, both, 5x: "Core la qPCR con los nuevos primers y normaliza contra GAPY." (missed GAPDH)
- whisper-large-v3-turbo, both, 5x: "Corre la QPSR con los nuevos primers y normaliza contra GAPI" (missed qPCR, GAPDH)

### control-en-1

Expected: Let's meet tomorrow at three in the office, and bring the report.

- gpt-4o-mini-transcribe, both, 5x: "Let's meet tomorrow at 3 in the office and bring the report." (chose es)
- gpt-4o-transcribe, both, 4x: "Let's meet tomorrow at 3 in the office and bring the report." (chose es)
- gpt-4o-mini-transcribe, both, 5x: "Let's meet tomorrow at 3 in the office, and bring the report." (chose es)
- gpt-4o-transcribe, both, 6x: "Let's meet tomorrow at 3 in the office, and bring the report." (chose es)

### control-en-2

Expected: I'll call my mother after lunch to plan the weekend trip.

- gpt-4o-mini-transcribe, both, 10x: "I'll call my mother after lunch to plan the weekend trip." (chose es)
- gpt-4o-transcribe, both, 6x: "I'll call my mother after lunch to plan the weekend trip." (chose es)
- gpt-4o-transcribe, one, 2x: "Llamaré a mi madre después del almuerzo para planificar el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es)
- gpt-4o-transcribe, both, 4x: "Llamaré a mi madre después del almuerzo para planificar el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es; chose es)
- gpt-4o-transcribe, one, 1x: "Llamaré a mi madre después del almuerzo para planear el viaje de fin de semana." (**invented content**; **wrong language**; 4 inserted words in a row; reads as es)

### control-es-2

Expected: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.

- gpt-transcribe, one, 4x: "Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana."
- gpt-transcribe, both, 5x: "Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana."

### mixed-3

Expected: El sprint termina el viernes, así que hagamos el standup a las nueve.

- gpt-4o-mini-transcribe, one, 5x: "El sprint termina el viernes, así que hagamos el stand-up a las 9." (missed standup)
- gpt-4o-mini-transcribe, both, 6x: "El sprint termina el viernes, así que hagamos el stand-up a las 9." (missed standup)

### long-es-1

Expected: Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corre los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

- whisper-large-v3-turbo, one, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge"
- whisper-large-v3, one, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-transcribe, one, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-mini-transcribe, one, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-transcribe, one, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-transcribe, both, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-mini-transcribe, both, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- gpt-4o-transcribe, both, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."
- whisper-large-v3-turbo, both, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge"
- whisper-large-v3, both, 5x: "Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge."

### long-en-1

Expected: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.

- gpt-4o-mini-transcribe, both, 10x: "So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)
- gpt-4o-transcribe, both, 5x: "So I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)
- gpt-4o-transcribe, both, 5x: "So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production." (chose es)

### long-mixed-1

Expected: Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback.

- gpt-4o-mini-transcribe, one, 5x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el DAC con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback." (missed deck)
- gpt-4o-mini-transcribe, both, 5x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el DAC con el roadmap del próximo quarter y me lo mandes antes del viernes para darle feedback." (missed deck)
- whisper-large-v3-turbo, one, 5x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuartel y me lo mandes antes del viernes para darle feedback." (missed quarter)
- gpt-4o-transcribe, one, 4x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuárter y me lo mandes antes del viernes para darle feedback." (missed quarter)
- gpt-4o-transcribe, both, 5x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuárter y me lo mandes antes del viernes para darle feedback." (missed quarter)
- whisper-large-v3-turbo, both, 5x: "Oye, acuérdate de que el kickoff con el cliente es el lunes, así que necesito que prepares el deck con el roadmap del próximo cuartel y me lo mandes antes del viernes para darle feedback." (missed quarter)

### quiet-en-1

Expected: Thank you, I already checked the report and it looks fine.

- gpt-4o-mini-transcribe, both, 5x: "Thank you. I already checked the report and it looks fine." (chose es)
- gpt-4o-transcribe, both, 5x: "Thank you. I already checked the report and it looks fine." (chose es)
- gpt-4o-mini-transcribe, both, 5x: "Thank you, I already checked the report and it looks fine." (chose es)
- gpt-4o-transcribe, both, 5x: "Thank you, I already checked the report and it looks fine." (chose es)

### noise-floor-es

Noise: white, -53 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and start up." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "LAMBDA" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "Thank you."

### noise-floor-en

Noise: white, -53 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "Thank you."
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the system." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "Thank you."

### noise-room-es

Noise: brown, -45 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "LAMBDA" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 1x: "context: ###
build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform
###" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 3x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 4x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 2x: "context:" (**hallucination**; text survives the level and phrase guards)

### noise-room-en

Noise: brown, -45 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 4x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 1x: "context:" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the screen." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 4x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 1x: "context:" (**hallucination**; text survives the level and phrase guards)

### noise-loud-es

Noise: brown, -30 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)

### noise-loud-en

Noise: brown, -30 dBFS, 4 s

- whisper-large-v3-turbo, one, 5x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, one, 5x: "and more." (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, one, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 2x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-mini-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, both, 5x: "build, CI/CD, deadline, deploy, hotfix, kubectl, Lambda, logs, merge, namespace, pipeline, pods, PR, rebase, roadmap, sprint, staging, standup, Terraform" (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3-turbo, both, 5x: "and the other side of the road." (**hallucination**; text survives the level and phrase guards)
- whisper-large-v3, both, 5x: "¿Qué es lo que se está haciendo?" (**hallucination**; text survives the level and phrase guards)
- gpt-4o-transcribe, one, 3x: "context:" (**hallucination**; text survives the level and phrase guards)


# End-to-end guard

Run 2026-10-24T04:21:19.043Z against the dev API with the production pipeline as deployed there, from code commit `5335d529a9bda9c5de642dc63e8cacbfe8dfb4b8` and fixtures sha256 `94e990b5892d786e`.
A throwaway user with the fixture's developer dictionary dictated each case under its own language; 3 concurrent requests opened the run to catch cold starts, then 5 sequential runs per case, paced to half of the production transcriber's free-plan limits.
Release to text is measured on the client that sent the request, so it includes that client's network to us-east-1.
Override for this run: Groq Whisper daily limits kept 10% free for production instead of half (--whisper-daily-kept 0.1); per-minute and hourly pacing unchanged.
Reproduce from the repository root: `pnpm --filter @take-my-word/api eval:e2e --results ../results/end-to-end-1 --report docs/tasks/0017_eval_harness/reports/end-to-end-1.md --runs 5 --burst 3 --whisper-daily-kept 0.1`.

## Latency

| Measure | P50 / P95 (samples) |
|---|---|
| Release to text, warm Lambda | 1921 ms / 3455 ms (30) |
| Release to text, cold Lambda | 3425 ms / 3445 ms (3) |
| Server total, warm | 1250 ms / 1997 ms (30) |
| Transcribe, warm | 540 ms / 1228 ms (30) |
| Refine, warm | 752 ms / 1118 ms (30) |
| dictate init duration | 559 ms / 592 ms (3) |
| authorizer init duration | 250 ms / 250 ms (1) |

Failed requests: 0 of 33.

## Every dictation

### dev-en-3

Expected: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.

- burst 1, cold (init 559 ms): 3425 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- burst 2, cold (init 446 ms): 3445 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.
- burst 3: 3455 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 1, cold (init 592 ms): 2511 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 2: 1448 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 3: 1726 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 4: 1784 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 5: 1921 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet

### dev-es-1

Expected: Abrí un PR para arreglar el pipeline de CI/CD, ¿lo puedes revisar antes del deploy?

- warm 1: 2202 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 2: 2028 ms release to text, raw WER 2/15, missed raw [CI/CD], text []
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI/CD. ¿Lo puedes revisar antes del deploy?
- warm 3: 2178 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 4: 1678 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 5: 1657 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?

### control-es-2

Expected: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.

- warm 1: 1521 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
- warm 2: 1440 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 3: 1426 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 4: 1642 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 5: 1717 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.

### mixed-1

Expected: Mañana tengo un meeting con el team de marketing para revisar el roadmap.

- warm 1: 1412 ms release to text, raw WER 0/13, missed raw [], text [team]
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el equipo de marketing para revisar el roadmap.
- warm 2: 1454 ms release to text, raw WER 0/13, missed raw [], text [team]
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el equipo de marketing para revisar el roadmap.
- warm 3: 2292 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.
- warm 4: 1825 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.
- warm 5: 1697 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.

### long-es-1

Expected: Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corre los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

- warm 1: 2510 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 2: 2538 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 3: 2532 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge
- warm 4: 2607 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge
- warm 5: 2356 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración. Así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

### long-en-1

Expected: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.

- warm 1: 2514 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 2: 1934 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 3: 3756 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 4: 2290 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 5: 2266 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production.


# End-to-end guard

Run 2026-10-23T21:31:06.981Z against the dev API with the production pipeline as deployed there, from code commit `7ad0fd1c11b7e658a0ca2326e773ec6a68288ea2` and fixtures sha256 `94e990b5892d786e`.
A throwaway user with the fixture's developer dictionary dictated each case under its own language; 3 concurrent requests opened the run to catch cold starts, then 5 sequential runs per case, paced to half of the production transcriber's free-plan limits.
Release to text is measured on the client that sent the request, so it includes that client's network to us-east-1.
Reproduce from the repository root: `pnpm --filter @take-my-word/api eval:e2e --results ../results/end-to-end-1 --report docs/tasks/0017_eval_harness/reports/end-to-end-1.md --runs 5 --burst 3`.

## Latency

| Measure | P50 / P95 (samples) |
|---|---|
| Release to text, warm Lambda | 1804 ms / 2686 ms (33) |
| Release to text, cold Lambda | n/a |
| Server total, warm | 1174 ms / 2082 ms (33) |
| Transcribe, warm | 414 ms / 1310 ms (33) |
| Refine, warm | 737 ms / 972 ms (33) |
| dictate init duration | n/a |
| authorizer init duration | n/a |

Failed requests: 0 of 33.

## Every dictation

### dev-en-3

Expected: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.

- burst 1: 1811 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- burst 2: 1791 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- burst 3: 2611 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 1: 1977 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.
- warm 2: 1646 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 3: 1531 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet.
- warm 4: 1947 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet
- warm 5: 1642 ms release to text, raw WER 1/14, missed raw [Lambda], text []
  - raw: The Terraform plan shows the Lamba will be replaced, so let's not merge yet
  - text: The Terraform plan shows the Lambda will be replaced, so let's not merge yet

### dev-es-1

Expected: Abrí un PR para arreglar el pipeline de CI/CD, ¿lo puedes revisar antes del deploy?

- warm 1: 1563 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 2: 1894 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 3: 1778 ms release to text, raw WER 2/15, missed raw [CI/CD], text []
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI/CD. ¿Lo puedes revisar antes del deploy?
- warm 4: 1689 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?
- warm 5: 1527 ms release to text, raw WER 2/15, missed raw [CI/CD], text [CI/CD]
  - raw: Abrí un PR para arreglar el pipeline de CI-CD. ¿Lo puedes revisar antes del deploy?
  - text: Abrí un PR para arreglar el pipeline de CI CD. ¿Lo puedes revisar antes del deploy?

### control-es-2

Expected: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.

- warm 1: 1502 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 2: 1305 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 3: 1564 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 4: 1289 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.
- warm 5: 1426 ms release to text, raw WER 0/17, missed raw [], text []
  - raw: Voy a llamar a mi mamá después de almuerzo para planear el viaje del fin de semana.
  - text: Voy a llamar a mi mamá después del almuerzo para planear el viaje del fin de semana.

### mixed-1

Expected: Mañana tengo un meeting con el team de marketing para revisar el roadmap.

- warm 1: 1581 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.
- warm 2: 1390 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.
- warm 3: 1792 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.
- warm 4: 1829 ms release to text, raw WER 0/13, missed raw [], text [team]
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el equipo de marketing para revisar el roadmap.
- warm 5: 1804 ms release to text, raw WER 0/13, missed raw [], text []
  - raw: Mañana tengo un meeting con el team de marketing para revisar el roadmap
  - text: Mañana tengo un meeting con el team de marketing para revisar el roadmap.

### long-es-1

Expected: Bueno, te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corre los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

- warm 1: 2088 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración. Así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 2: 2143 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración. Así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 3: 2218 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración. Así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 4: 3007 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración. Así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.
- warm 5: 2006 ms release to text, raw WER 1/44, missed raw [], text []
  - raw: Bueno, te cuento que ayer revisé el pipeline de deploy, y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix, y te aviso cuando esté en verde para que hagamos el merge
  - text: Te cuento que ayer revisé el pipeline de deploy y encontré que el build falla cuando corren los tests de integración, así que voy a abrir un PR con el hotfix y te aviso cuando esté en verde para que hagamos el merge.

### long-en-1

Expected: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.

- warm 1: 2024 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 2: 2652 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 3: 2564 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 4: 2686 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.
- warm 5: 2221 ms release to text, raw WER 0/39, missed raw [], text []
  - raw: So I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production
  - text: I talked to the team this morning, and we agreed to move the release to Thursday, because the staging environment is still down and we need at least two days of testing before we can deploy to production.


import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { z } from "zod";
import { createLogger } from "../lib/log.ts";

import { evalRequestSchema, type EvalResponse } from "./contract.ts";
import { execute } from "./execute.ts";
import { dispatcherFor, probedFetch } from "./http-probe.ts";
import { cachedEvalKeys } from "./keys.ts";

const config = z
  .object({
    PROVIDERS_SECRET_ID: z.string().min(1),
    AWS_REGION: z.string().min(1),
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: z.coerce.number().int().positive(),
  })
  .parse(process.env);
const keys = cachedEvalKeys(new SecretsManagerClient({}), config.PROVIDERS_SECRET_ID);
const log = createLogger({ function: "eval" });
const elapsed = () => performance.now();
const where = { region: config.AWS_REGION, memoryMb: config.AWS_LAMBDA_FUNCTION_MEMORY_SIZE };
let cold = true;

export async function handler(event: unknown): Promise<EvalResponse> {
  const coldStart = cold;
  cold = false;
  const request = evalRequestSchema.parse(event);
  await keys();
  if (request.kind === "warmup") {
    return { ok: true, label: "warmup", calls: [], coldStart, ...where };
  }
  const result = await execute(request, {
    keys,
    dispatcherFor,
    probedFetch: (dispatcher, records) => probedFetch(dispatcher, elapsed, records),
    elapsed,
  });
  log.info("eval call", {
    kind: request.kind,
    label: result.label,
    connection: request.connection,
    ok: result.ok,
    status: result.error?.status,
    calls: result.calls.length,
    ms: Math.round(result.calls.reduce((sum, call) => sum + call.ms, 0)),
    coldStart,
  });
  return { ...result, coldStart, ...where };
}

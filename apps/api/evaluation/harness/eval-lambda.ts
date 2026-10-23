import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InvokeCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  waitUntilFunctionUpdatedV2,
} from "@aws-sdk/client-lambda";
import { build } from "esbuild";
import {
  evalResponseSchema,
  type EvalRequest,
  type EvalResponse,
} from "../../src/eval/contract.ts";

const apiRoot = join(import.meta.dirname, "..", "..");

export interface EvalBundle {
  zip: Buffer;
  sha256: string;
}

export async function buildEvalBundle(): Promise<EvalBundle> {
  const dir = mkdtempSync(join(tmpdir(), "tmw-eval-"));
  try {
    await build({
      entryPoints: [join(apiRoot, "src", "eval", "handler.ts")],
      outfile: join(dir, "index.mjs"),
      bundle: true,
      platform: "node",
      target: "node24",
      format: "esm",
      minify: true,
      keepNames: true,
      sourcemap: true,
      legalComments: "none",
      logLevel: "silent",
      banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });
    const zip = join(dir, "eval.zip");
    execFileSync("zip", [
      "-q",
      "-X",
      "-j",
      zip,
      join(dir, "index.mjs"),
      join(dir, "index.mjs.map"),
    ]);
    return {
      zip: readFileSync(zip),
      sha256: createHash("sha256")
        .update(readFileSync(join(dir, "index.mjs")))
        .digest("hex"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface EvalFunction {
  name: string;
  invoke(request: EvalRequest): Promise<EvalResponse & { invokeMs: number }>;
}

export async function deployEvalFunction(
  lambda: LambdaClient,
  name: string,
  bundle: EvalBundle,
): Promise<EvalFunction> {
  await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile: bundle.zip }));
  await waitUntilFunctionUpdatedV2({ client: lambda, maxWaitTime: 120 }, { FunctionName: name });
  return {
    name,
    async invoke(request) {
      const start = performance.now();
      const result = await lambda.send(
        new InvokeCommand({ FunctionName: name, Payload: JSON.stringify(request) }),
      );
      const invokeMs = performance.now() - start;
      const payload = Buffer.from(result.Payload ?? new Uint8Array()).toString("utf8");
      if (result.FunctionError !== undefined) {
        throw new Error(`eval Lambda failed (${result.FunctionError}): ${payload.slice(0, 500)}`);
      }
      return { ...evalResponseSchema.parse(JSON.parse(payload)), invokeMs };
    },
  };
}

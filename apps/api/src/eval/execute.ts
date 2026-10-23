import type { Language } from "@take-my-word/shared";
import type { Dispatcher } from "undici";
import { transcribeIn } from "../dictation/language-selection.ts";
import { ProviderError } from "../dictation/ports/provider-error.ts";
import type { TranscriptionUsage } from "../dictation/ports/transcriber.ts";
import type { Fetch } from "../dictation/providers/http.ts";
import type { ProviderKeys } from "../lib/secrets.ts";
import { buildRefiner, buildTranscriber } from "./candidates.ts";
import type { Connection, EvalResponse, ProviderCall, ProviderRequest } from "./contract.ts";
import type { HttpRecord } from "./http-probe.ts";

export interface ExecuteDeps {
  keys: () => Promise<ProviderKeys>;
  dispatcherFor: (connection: Connection) => {
    dispatcher: Dispatcher;
    release: () => Promise<void>;
  };
  probedFetch: (dispatcher: Dispatcher, records: HttpRecord[]) => Fetch;
  elapsed: () => number;
}

export type ExecuteResult = Omit<EvalResponse, "coldStart" | "region" | "memoryMb">;

export async function execute(request: ProviderRequest, deps: ExecuteDeps): Promise<ExecuteResult> {
  const { dispatcher, release } = deps.dispatcherFor(request.connection);
  const records: HttpRecord[] = [];
  const fetch = deps.probedFetch(dispatcher, records);
  const calls: ProviderCall[] = [];

  async function measured<T>(
    requested: Language | undefined,
    work: () => Promise<T>,
    usageOf: (result: T) => TranscriptionUsage | undefined = () => undefined,
  ): Promise<T> {
    const recorded = records.length;
    const start = deps.elapsed();
    const finish = (error?: string, usage?: TranscriptionUsage) => {
      const http = records[recorded];
      calls.push({
        ...(requested && { requested }),
        ...(usage && { usage }),
        ms: deps.elapsed() - start,
        ...(http && { headersMs: http.headersMs }),
        ...(http?.status !== undefined && { status: http.status }),
        newConnections: http?.newConnections ?? 0,
        headers: http?.headers ?? {},
        ...(error !== undefined && { error }),
      });
    };
    try {
      const result = await work();
      finish(undefined, usageOf(result));
      return result;
    } catch (error) {
      finish(error instanceof Error ? error.message : "unknown");
      throw error;
    }
  }

  let label = "";
  try {
    if (request.kind === "transcribe") {
      const transcriber = buildTranscriber(request.transcriber, deps.keys, fetch);
      label = transcriber.label;
      const audio = Buffer.from(request.audioBase64, "base64");
      const chosen = await transcribeIn(request.languages, (requested) =>
        measured(
          requested,
          () =>
            transcriber.transcribe({
              audio,
              container: request.container,
              ...(requested && { language: requested }),
              ...(request.prompt !== "" && { prompt: request.prompt }),
            }),
          (transcript) => transcript.usage,
        ),
      );
      return { ok: true, label, text: chosen.text, language: chosen.language, calls };
    }
    const refiner = buildRefiner(request.refiner, deps.keys, fetch);
    label = refiner.label;
    const refined = await measured(undefined, () =>
      refiner.refine({
        raw: request.raw,
        language: request.language,
        instructions: request.instructions,
      }),
    );
    return { ok: true, label, text: refined.text, usage: refined.usage, calls };
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error;
    return {
      ok: false,
      label,
      error: {
        ...(error.status !== undefined && { status: error.status }),
        message: error.message,
      },
      calls,
    };
  } finally {
    await release();
  }
}

import { dictionaryHalfLifeDays, emptyUserContext, type Language } from "@take-my-word/shared";
import type { Dispatcher } from "undici";
import { dictate } from "../dictation/dictate.ts";
import { transcribeIn } from "../dictation/language-selection.ts";
import { ProviderError } from "../dictation/ports/provider-error.ts";
import type { Refiner } from "../dictation/ports/refiner.ts";
import type { Transcriber, TranscriptionUsage } from "../dictation/ports/transcriber.ts";
import type { Fetch } from "../dictation/providers/http.ts";
import { refinerOf, transcriberOf } from "../dictation/providers/registry.ts";
import { createSilenceGuard, defaultSilenceLevels } from "../dictation/silence.ts";
import { defaultSttPromptTokenBudget } from "../dictate/config.ts";
import { HttpError } from "../lib/http-error.ts";
import { createLogger } from "../lib/log.ts";
import type { ProviderKeys } from "../lib/secrets.ts";
import type {
  Connection,
  EvalRequest,
  EvalResponse,
  ProviderCall,
  ProviderRequest,
} from "./contract.ts";
import type { HttpRecord } from "./http-probe.ts";

export interface ExecuteDeps {
  keys: () => Promise<ProviderKeys>;
  dispatcherFor: (connection: Connection) => {
    dispatcher: Dispatcher;
    release: () => Promise<void>;
  };
  probedFetch: (dispatcher: Dispatcher, records: HttpRecord[]) => Fetch;
  elapsed: () => number;
  now?: () => Date;
}

export type ExecuteResult = Omit<EvalResponse, "coldStart" | "region" | "memoryMb">;

type DictateRequest = Extract<EvalRequest, { kind: "dictate" }>;

const isSilence = createSilenceGuard();
const quiet = createLogger({}, () => undefined);

export async function execute(request: ProviderRequest, deps: ExecuteDeps): Promise<ExecuteResult> {
  const { dispatcher, release } = deps.dispatcherFor(request.connection);
  const records: HttpRecord[] = [];
  const fetch = deps.probedFetch(dispatcher, records);
  const calls: ProviderCall[] = [];

  async function measured<T>(
    stage: NonNullable<ProviderCall["stage"]>,
    requested: Language | undefined,
    work: () => Promise<T>,
    usageOf: (result: T) => TranscriptionUsage | undefined = () => undefined,
  ): Promise<T> {
    const recorded = records.length;
    const start = deps.elapsed();
    const finish = (error?: string, usage?: TranscriptionUsage) => {
      const http = records[recorded];
      calls.push({
        stage,
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

  const measuredTranscriber = (transcriber: Transcriber): Transcriber => ({
    label: transcriber.label,
    transcribe: (input) =>
      measured(
        "transcribe",
        input.language,
        () => transcriber.transcribe(input),
        (transcript) => transcript.usage,
      ),
  });
  const measuredRefiner = (refiner: Refiner): Refiner => ({
    label: refiner.label,
    refine: (input) =>
      measured(
        "refine",
        undefined,
        () => refiner.refine(input),
        (refined) => refined.usage,
      ),
  });

  const failedCall = () => calls.findLast((call) => call.error !== undefined);

  let label = "";
  try {
    if (request.kind === "transcribe") {
      const transcriber = measuredTranscriber(
        transcriberOf(request.transcriber, deps.keys, { fetch }),
      );
      label = transcriber.label;
      const audio = Buffer.from(request.audioBase64, "base64");
      const chosen = await transcribeIn(request.languages, (requested) =>
        transcriber.transcribe({
          audio,
          container: request.container,
          ...(requested && { language: requested }),
          ...(request.prompt !== "" && { prompt: request.prompt }),
        }),
      );
      return { ok: true, label, text: chosen.text, language: chosen.language, calls };
    }
    if (request.kind === "refine") {
      const refiner = measuredRefiner(refinerOf(request.refiner, deps.keys, { fetch }));
      label = refiner.label;
      const refined = await refiner.refine({
        raw: request.raw,
        language: request.language,
        instructions: request.instructions,
      });
      return { ok: true, label, text: refined.text, usage: refined.usage, calls };
    }
    const transcriber = measuredTranscriber(
      transcriberOf(request.transcriber, deps.keys, { fetch }),
    );
    const refiner = measuredRefiner(refinerOf(request.refiner, deps.keys, { fetch }));
    label = `${transcriber.label} + ${refiner.label}`;
    const dictation = await dictateInLambda(request, transcriber, refiner, deps);
    return { ok: true, label, text: dictation.text, dictation, calls };
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        ok: false,
        label,
        error: {
          ...(error.status !== undefined && { status: error.status }),
          message: error.message,
        },
        calls,
      };
    }
    const failed = failedCall();
    if (error instanceof HttpError && error.code === "provider_failed" && failed !== undefined) {
      return {
        ok: false,
        label,
        error: {
          ...(failed.status !== undefined && { status: failed.status }),
          message: failed.error ?? error.message,
        },
        calls,
      };
    }
    throw error;
  } finally {
    await release();
  }
}

function dictateInLambda(
  request: DictateRequest,
  transcriber: Transcriber,
  refiner: Refiner,
  deps: ExecuteDeps,
) {
  const [first = "en"] = request.languages;
  const terms = request.terms.map(({ term, aliases }) => ({
    key: term.toLowerCase(),
    term,
    aliases,
    useCount: 1,
    lastUsedAt: request.termsUsedAt,
    createdAt: request.termsUsedAt,
  }));
  return dictate(
    {
      userId: "eval",
      requestId: "eval",
      upload: {
        meta: {},
        audio: { container: request.container, bytes: Buffer.from(request.audioBase64, "base64") },
      },
    },
    {
      providers: { transcriber, refiner },
      quota: { charge: () => Promise.resolve(true) },
      dailyQuotaMinutes: 60,
      dictations: { save: () => Promise.resolve() },
      profile: {
        load: () =>
          Promise.resolve({
            settings: {
              defaultStyleId: "plain",
              locale: first,
              dictationLanguages: request.languages,
              context: emptyUserContext,
            },
            styles: [],
            terms,
          }),
      },
      dictionary: {
        halfLifeDays: dictionaryHalfLifeDays,
        promptTokenBudget: defaultSttPromptTokenBudget,
      },
      isSilence,
      silenceLevels: defaultSilenceLevels,
      metrics: () => undefined,
      log: quiet,
      now: deps.now ?? (() => new Date()),
      elapsed: deps.elapsed,
    },
  );
}

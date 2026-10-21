import {
  defaultRefiner,
  defaultTranscriber,
  type DictationResponse,
  type Language,
} from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";
import type { Logger } from "../lib/log.ts";
import type { Metrics } from "../lib/metrics.ts";
import { audioDurationSeconds } from "./audio/duration.ts";
import { InvalidAudioError } from "./audio/invalid-audio.ts";
import type { AudioSink } from "./audio-sink.ts";
import type { DictationStore } from "./dictation-store.ts";
import { ProviderError } from "./ports/provider-error.ts";
import { plainV1 } from "./prompts/plain.v1.ts";
import type { ProviderRegistry } from "./providers/registry.ts";
import { quotaExceededMessage, quotaWindow, type QuotaStore } from "./quota.ts";
import type { DictationUpload } from "./upload.ts";

export interface DictateDeps {
  providers: ProviderRegistry;
  quota: QuotaStore;
  dailyQuotaMinutes: number;
  dictations: DictationStore;
  isSilence: (raw: string) => boolean;
  audioSink?: AudioSink;
  metrics: Metrics;
  log: Logger;
  now: () => Date;
  elapsed: () => number;
}

export interface DictateRequest {
  userId: string;
  requestId: string;
  upload: DictationUpload;
}

function languageOf(locale: string): Language {
  return locale.startsWith("en") ? "en" : "es";
}

async function timed<T>(deps: DictateDeps, work: () => Promise<T>): Promise<[T, number]> {
  const start = deps.elapsed();
  const result = await work();
  return [result, Math.round(deps.elapsed() - start)];
}

async function callProvider<T>(
  deps: DictateDeps,
  provider: string,
  work: () => Promise<T>,
  tokens: (result: T) => { inputTokens?: number; outputTokens?: number } = () => ({}),
): Promise<[T, number]> {
  const start = deps.elapsed();
  try {
    const result = await work();
    const latencyMs = Math.round(deps.elapsed() - start);
    deps.metrics({ provider, latencyMs, failed: false, ...tokens(result) });
    return [result, latencyMs];
  } catch (error) {
    const latencyMs = Math.round(deps.elapsed() - start);
    deps.metrics({ provider, latencyMs, failed: true });
    if (error instanceof ProviderError) {
      deps.log.error("provider failed", { provider, status: error.status, reason: error.message });
      throw new HttpError("provider_failed", `${provider} failed; try again.`);
    }
    throw error;
  }
}

export async function dictate(
  { userId, requestId, upload }: DictateRequest,
  deps: DictateDeps,
): Promise<DictationResponse> {
  const startedAt = deps.elapsed();
  const createdAt = deps.now();
  const { meta, audio } = upload;
  const language = languageOf(meta.locale);
  const transcriber = deps.providers.transcribers[meta.sttProvider ?? defaultTranscriber];
  const refiner = deps.providers.refiners[meta.refineProvider ?? defaultRefiner];

  let audioSeconds: number;
  try {
    audioSeconds = audioDurationSeconds(audio.container, audio.bytes);
  } catch (error) {
    if (error instanceof InvalidAudioError) {
      throw new HttpError("bad_request", `The audio part is not a valid ${audio.container} file.`);
    }
    throw error;
  }

  const window = quotaWindow(createdAt);
  const [allowed, quotaMs] = await timed(deps, () =>
    deps.quota.charge({
      userId,
      day: window.day,
      seconds: audioSeconds,
      capSeconds: deps.dailyQuotaMinutes * 60,
      expiresAt: window.expiresAt,
    }),
  );
  if (!allowed) {
    deps.log.info("quota exceeded", { audioSeconds, quotaMs });
    throw new HttpError("quota_exceeded", quotaExceededMessage(deps.dailyQuotaMinutes));
  }

  if (deps.audioSink) {
    await deps.audioSink.put({ userId, requestId, createdAt, audio }).catch((error: unknown) => {
      deps.log.error("debug audio not kept", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    });
  }

  const [{ text: raw }, transcribeMs] = await callProvider(deps, transcriber.label, () =>
    transcriber.transcribe({ audio: audio.bytes, container: audio.container, language }),
  );

  if (deps.isSilence(raw)) {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("dictation skipped", {
      skipped: "silence",
      audioSeconds,
      transcriber: transcriber.label,
      quotaMs,
      transcribeMs,
      totalMs,
    });
    return {
      raw,
      text: "",
      skipped: "silence",
      providers: { transcriber: transcriber.label },
      latencyMs: { quota: quotaMs, transcribe: transcribeMs, total: totalMs },
    };
  }

  const [refined, refineMs] = await callProvider(
    deps,
    refiner.label,
    () => refiner.refine({ raw, language, instructions: plainV1[language] }),
    (result) => result.usage,
  );

  const providers = { transcriber: transcriber.label, refiner: refiner.label };
  const [, saveMs] = await timed(deps, () =>
    deps.dictations.save({
      userId,
      requestId,
      createdAt,
      locale: meta.locale,
      audioSeconds,
      raw,
      text: refined.text,
      providers,
      latencyMs: { quota: quotaMs, transcribe: transcribeMs, refine: refineMs },
      tokens: refined.usage,
    }),
  );

  const totalMs = Math.round(deps.elapsed() - startedAt);
  deps.log.info("dictation done", {
    audioSeconds,
    transcriber: providers.transcriber,
    refiner: providers.refiner,
    inputTokens: refined.usage.inputTokens,
    outputTokens: refined.usage.outputTokens,
    quotaMs,
    transcribeMs,
    refineMs,
    saveMs,
    totalMs,
  });
  return {
    raw,
    text: refined.text,
    providers,
    latencyMs: {
      quota: quotaMs,
      transcribe: transcribeMs,
      refine: refineMs,
      save: saveMs,
      total: totalMs,
    },
  };
}

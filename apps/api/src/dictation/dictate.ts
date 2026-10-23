import {
  defaultDictationLanguages,
  defaultRefiner,
  defaultTranscriber,
  minAudioSeconds,
  type DictationResponse,
} from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";
import type { Logger } from "../lib/log.ts";
import type { Metrics } from "../lib/metrics.ts";
import { probeAudio, type AudioProbe } from "./audio/probe.ts";
import { AudioTooShortError, InvalidAudioError } from "./audio/invalid-audio.ts";
import type { AudioSink } from "./audio-sink.ts";
import type { DictationStore } from "./dictation-store.ts";
import { ProviderError } from "./ports/provider-error.ts";
import { transcriberPrompt } from "./dictionary-projection.ts";
import { refinerInstructions } from "./instructions.ts";
import { transcribeIn } from "./language-selection.ts";
import type { ProfileStore } from "./profile.ts";
import type { ProviderRegistry } from "./providers/registry.ts";
import { quotaExceededMessage, quotaWindow, type QuotaStore } from "./quota.ts";
import type { SilenceLevels } from "./silence.ts";
import { resolveStyle } from "./style-resolution.ts";
import type { DictationUpload } from "./upload.ts";

export interface DictateDeps {
  providers: ProviderRegistry;
  quota: QuotaStore;
  dailyQuotaMinutes: number;
  dictations: DictationStore;
  profile: ProfileStore;
  dictionary: { halfLifeDays: number; promptTokenBudget: number };
  isSilence: (transcript: { text: string; quiet: boolean }) => boolean;
  silenceLevels: SilenceLevels;
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

  let probe: AudioProbe;
  try {
    probe = probeAudio(audio.container, audio.bytes);
  } catch (error) {
    if (error instanceof InvalidAudioError) {
      throw new HttpError(
        "bad_request",
        audio.container === "wav"
          ? "The audio part is not a 16 kHz mono 16-bit PCM WAV file."
          : "The audio part is not a valid m4a file.",
      );
    }
    if (error instanceof AudioTooShortError) {
      throw new HttpError(
        "bad_request",
        `Recordings under ${minAudioSeconds} s are not transcribed.`,
      );
    }
    throw error;
  }
  const audioSeconds = probe.seconds;
  const { sustainedLevelDbfs } = probe;

  if (sustainedLevelDbfs !== undefined && sustainedLevelDbfs < deps.silenceLevels.floorDbfs) {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("dictation skipped", {
      skipped: "silence",
      stage: "level",
      sustainedLevelDbfs: Math.round(sustainedLevelDbfs),
      audioSeconds,
      totalMs,
    });
    return { raw: "", text: "", skipped: "silence", providers: {}, latencyMs: { total: totalMs } };
  }
  const quiet =
    sustainedLevelDbfs !== undefined && sustainedLevelDbfs < deps.silenceLevels.speechLevelDbfs;
  const levelDbfs = sustainedLevelDbfs === undefined ? undefined : Math.round(sustainedLevelDbfs);

  const window = quotaWindow(createdAt);
  const [[allowed, quotaMs], [profile, profileMs]] = await Promise.all([
    timed(deps, () =>
      deps.quota.charge({
        userId,
        day: window.day,
        seconds: audioSeconds,
        capSeconds: deps.dailyQuotaMinutes * 60,
        expiresAt: window.expiresAt,
      }),
    ),
    timed(deps, () => deps.profile.load(userId, meta.appId)),
  ]);
  if (!allowed) {
    deps.log.info("quota exceeded", { audioSeconds, quotaMs });
    throw new HttpError("quota_exceeded", quotaExceededMessage(deps.dailyQuotaMinutes));
  }

  const { settings } = profile;
  const transcriber =
    deps.providers.transcribers[
      meta.sttProvider ?? settings?.providers.transcriber ?? defaultTranscriber
    ];
  const refiner =
    deps.providers.refiners[meta.refineProvider ?? settings?.providers.refiner ?? defaultRefiner];
  const style = resolveStyle({
    requested: meta.styleId,
    rule: profile.rule?.styleId,
    defaultStyleId: settings?.defaultStyleId,
    custom: profile.styles,
  });
  const prompt = transcriberPrompt(profile.terms, {
    now: createdAt,
    halfLifeDays: deps.dictionary.halfLifeDays,
    tokenBudget: deps.dictionary.promptTokenBudget,
  });

  if (deps.audioSink) {
    await deps.audioSink.put({ userId, requestId, createdAt, audio }).catch((error: unknown) => {
      deps.log.error("debug audio not kept", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    });
  }

  let transcribeMs = 0;
  const transcriptions: string[] = [];
  const { text: raw, language } = await transcribeIn(
    settings?.dictationLanguages ?? defaultDictationLanguages,
    async (requested) => {
      const [transcript, ms] = await callProvider(deps, transcriber.label, () =>
        transcriber.transcribe({
          audio: audio.bytes,
          container: audio.container,
          ...(requested && { language: requested }),
          ...(prompt.prompt !== "" && { prompt: prompt.prompt }),
        }),
      );
      transcribeMs += ms;
      transcriptions.push(requested ?? "detect");
      return transcript;
    },
  );

  if (deps.isSilence({ text: raw, quiet })) {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("dictation skipped", {
      skipped: "silence",
      stage: "transcript",
      quiet,
      sustainedLevelDbfs: levelDbfs,
      audioSeconds,
      transcriber: transcriber.label,
      quotaMs,
      profileMs,
      transcribeMs,
      totalMs,
    });
    return {
      raw,
      text: "",
      skipped: "silence",
      providers: { transcriber: transcriber.label },
      latencyMs: { quota: quotaMs, profile: profileMs, transcribe: transcribeMs, total: totalMs },
    };
  }

  const [refined, refineMs] = await callProvider(
    deps,
    refiner.label,
    () =>
      refiner.refine({
        raw,
        language,
        instructions: refinerInstructions(language, style.prompt, profile.terms),
      }),
    (result) => result.usage,
  );

  const providers = { transcriber: transcriber.label, refiner: refiner.label };
  const [, saveMs] = await timed(deps, () =>
    deps.dictations.save({
      userId,
      requestId,
      createdAt,
      locale: language,
      audioSeconds,
      raw,
      text: refined.text,
      styleId: style.id,
      providers,
      latencyMs: { quota: quotaMs, profile: profileMs, transcribe: transcribeMs, refine: refineMs },
      tokens: refined.usage,
    }),
  );

  const totalMs = Math.round(deps.elapsed() - startedAt);
  deps.log.info("dictation done", {
    audioSeconds,
    sustainedLevelDbfs: levelDbfs,
    transcriber: providers.transcriber,
    refiner: providers.refiner,
    styleId: style.id,
    language,
    transcriptions: transcriptions.join(","),
    promptTerms: prompt.terms,
    dictionaryTerms: profile.terms.length,
    inputTokens: refined.usage.inputTokens,
    outputTokens: refined.usage.outputTokens,
    quotaMs,
    profileMs,
    transcribeMs,
    refineMs,
    saveMs,
    totalMs,
  });
  return {
    raw,
    text: refined.text,
    styleId: style.id,
    providers,
    latencyMs: {
      quota: quotaMs,
      profile: profileMs,
      transcribe: transcribeMs,
      refine: refineMs,
      save: saveMs,
      total: totalMs,
    },
  };
}

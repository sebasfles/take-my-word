import { defaultDictationLanguages, minAudioSeconds, type Language } from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";
import type { Logger } from "../lib/log.ts";
import type { Metrics } from "../lib/metrics.ts";
import { AudioTooShortError, InvalidAudioError } from "./audio/invalid-audio.ts";
import { probeAudio, type AudioProbe } from "./audio/probe.ts";
import type { AudioSink } from "./audio-sink.ts";
import type { DictationStore } from "./dictation-store.ts";
import { promptWithPreviousText, transcriberPrompt } from "./dictionary-projection.ts";
import { transcribeIn, type ChosenTranscript } from "./language-selection.ts";
import { ProviderError } from "./ports/provider-error.ts";
import type { DictationProfile, ProfileStore } from "./profile.ts";
import type { Refiner } from "./ports/refiner.ts";
import type { Transcriber } from "./ports/transcriber.ts";
import type { QuotaStore } from "./quota.ts";
import type { ReceiptKey } from "./receipt.ts";
import type { SilenceLevels } from "./silence.ts";
import type { UsageStore } from "../usage/store.ts";
import type { UploadedAudio } from "./upload.ts";

export interface SelectedProviders {
  transcriber: Transcriber;
  refiner: Refiner;
}

export interface DictateDeps {
  providers: SelectedProviders;
  quota: QuotaStore;
  usage: UsageStore;
  dailyQuotaMinutes: number;
  dictations: DictationStore;
  profile: ProfileStore;
  dictionary: { halfLifeDays: number; promptTokenBudget: number };
  isSilence: (transcript: { text: string; quiet: boolean }) => boolean;
  silenceLevels: SilenceLevels;
  receipts?: ReceiptKey;
  audioSink?: AudioSink;
  metrics: Metrics;
  log: Logger;
  now: () => Date;
  elapsed: () => number;
}

export async function timed<T>(deps: DictateDeps, work: () => Promise<T>): Promise<[T, number]> {
  const start = deps.elapsed();
  const result = await work();
  return [result, Math.round(deps.elapsed() - start)];
}

export async function callProvider<T>(
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

export function probe(audio: UploadedAudio, { allowShort }: { allowShort: boolean }) {
  try {
    return probeAudio(audio.container, audio.bytes);
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
      if (allowShort) return undefined;
      throw new HttpError(
        "bad_request",
        `Recordings under ${minAudioSeconds} s are not transcribed.`,
      );
    }
    throw error;
  }
}

export interface Level {
  silent: boolean;
  quiet: boolean;
  dbfs: number | undefined;
}

export function levelOf(probed: AudioProbe, levels: SilenceLevels): Level {
  const { sustainedLevelDbfs } = probed;
  return {
    silent: sustainedLevelDbfs !== undefined && sustainedLevelDbfs < levels.floorDbfs,
    quiet: sustainedLevelDbfs !== undefined && sustainedLevelDbfs < levels.speechLevelDbfs,
    dbfs: sustainedLevelDbfs === undefined ? undefined : Math.round(sustainedLevelDbfs),
  };
}

export function dictationLanguages(profile: DictationProfile): readonly Language[] {
  return profile.settings?.dictationLanguages ?? defaultDictationLanguages;
}

export interface Transcription extends ChosenTranscript {
  transcriber: string;
  transcribeMs: number;
  transcriptions: string;
  promptTerms: number;
  promptTailBytes: number;
}

export async function transcribe(
  deps: DictateDeps,
  {
    audio,
    profile,
    language,
    previous,
    createdAt,
  }: {
    audio: UploadedAudio;
    profile: DictationProfile;
    language: Language | undefined;
    previous: string;
    createdAt: Date;
  },
): Promise<Transcription> {
  const { transcriber } = deps.providers;
  const terms = transcriberPrompt(profile.terms, {
    now: createdAt,
    halfLifeDays: deps.dictionary.halfLifeDays,
    tokenBudget: deps.dictionary.promptTokenBudget,
  });
  const { prompt, tailBytes } = promptWithPreviousText(
    terms.prompt,
    previous,
    deps.dictionary.promptTokenBudget,
  );
  let transcribeMs = 0;
  const transcriptions: string[] = [];
  const chosen = await transcribeIn(
    dictationLanguages(profile),
    async (requested) => {
      const [transcript, ms] = await callProvider(deps, transcriber.label, () =>
        transcriber.transcribe({
          audio: audio.bytes,
          container: audio.container,
          ...(requested && { language: requested }),
          ...(prompt !== "" && { prompt }),
        }),
      );
      transcribeMs += ms;
      transcriptions.push(requested ?? "detect");
      return transcript;
    },
    language,
  );
  return {
    ...chosen,
    transcriber: transcriber.label,
    transcribeMs,
    transcriptions: transcriptions.join(","),
    promptTerms: terms.terms,
    promptTailBytes: tailBytes,
  };
}

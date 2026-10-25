import { maxTakeSeconds, type DictationResponse, type Language } from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";
import { refinerInstructions } from "./instructions.ts";
import { quotaExceededMessage, quotaWindow } from "./quota.ts";
import { verifyReceipt } from "./receipt.ts";
import {
  callProvider,
  dictationLanguages,
  levelOf,
  probe,
  timed,
  transcribe,
  type DictateDeps,
  type Transcription,
} from "./stages.ts";
import { resolveStyle } from "./style-resolution.ts";
import type { DictationUpload } from "./upload.ts";

export type { DictateDeps, SelectedProviders } from "./stages.ts";

export interface DictateRequest {
  userId: string;
  requestId: string;
  upload: DictationUpload;
}

const takeToleranceSeconds = 2;

interface EarlierSegment {
  text: string;
  seconds: number;
  language: Language;
}

function verifiedEarlier(
  deps: DictateDeps,
  userId: string,
  upload: DictationUpload,
): EarlierSegment[] | undefined {
  if (upload.earlier === undefined) return undefined;
  const key = deps.receipts;
  if (key === undefined) {
    throw new HttpError("bad_request", "This server does not take earlier segments.");
  }
  const receipts = upload.earlier.map((segment) => segment.receipt);
  if (new Set(receipts).size !== receipts.length) {
    throw new HttpError("bad_request", "A segment receipt is repeated.");
  }
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  return upload.earlier.map(({ text, receipt }) => {
    const claims = verifyReceipt(key, userId, text, receipt, nowSeconds);
    if (claims === undefined) {
      throw new HttpError("bad_request", "A segment receipt is invalid or expired.");
    }
    return { text, seconds: claims.seconds, language: claims.language };
  });
}

function joined(texts: readonly string[]): string {
  return texts
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .join(" ");
}

export async function dictate(
  { userId, requestId, upload }: DictateRequest,
  deps: DictateDeps,
): Promise<DictationResponse> {
  const startedAt = deps.elapsed();
  const createdAt = deps.now();
  const { meta, audio } = upload;
  const earlier = verifiedEarlier(deps, userId, upload);
  const probed = probe(audio, { allowShort: earlier !== undefined });
  const level = probed && levelOf(probed, deps.silenceLevels);

  if (earlier === undefined && probed && level?.silent) {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("dictation skipped", {
      skipped: "silence",
      stage: "level",
      sustainedLevelDbfs: level.dbfs,
      audioSeconds: probed.seconds,
      totalMs,
    });
    return { raw: "", text: "", skipped: "silence", providers: {}, latencyMs: { total: totalMs } };
  }
  const ownSeconds = probed && !level?.silent ? probed.seconds : undefined;
  const segmentSeconds = earlier?.reduce((sum, segment) => sum + segment.seconds, 0) ?? 0;
  if (earlier && segmentSeconds + (probed?.seconds ?? 0) > maxTakeSeconds + takeToleranceSeconds) {
    throw new HttpError("bad_request", `A take is limited to ${maxTakeSeconds} s of audio.`);
  }

  const window = quotaWindow(createdAt);
  const [[allowed, quotaMs], [profile, profileMs]] = await Promise.all([
    ownSeconds === undefined
      ? Promise.resolve<[boolean, number]>([true, 0])
      : timed(deps, () =>
          deps.quota.charge({
            userId,
            day: window.day,
            seconds: ownSeconds,
            capSeconds: earlier === undefined ? deps.dailyQuotaMinutes * 60 : undefined,
            expiresAt: window.expiresAt,
          }),
        ),
    timed(deps, () => deps.profile.load(userId, meta.appId)),
  ]);
  if (!allowed) {
    deps.log.info("quota exceeded", { audioSeconds: ownSeconds, quotaMs });
    throw new HttpError("quota_exceeded", quotaExceededMessage(deps.dailyQuotaMinutes));
  }

  const { transcriber, refiner } = deps.providers;
  const style = resolveStyle({
    requested: meta.styleId,
    rule: profile.rule?.styleId,
    defaultStyleId: profile.settings?.defaultStyleId,
    custom: profile.styles,
  });

  if (deps.audioSink && ownSeconds !== undefined) {
    await deps.audioSink.put({ userId, requestId, createdAt, audio }).catch((error: unknown) => {
      deps.log.error("debug audio not kept", {
        reason: error instanceof Error ? error.name : "unknown",
      });
    });
  }

  const languages = dictationLanguages(profile);
  const requestedLanguage = meta.language ?? earlier?.[0]?.language;
  const own: Transcription | undefined =
    ownSeconds === undefined
      ? undefined
      : await transcribe(deps, {
          audio,
          profile,
          language: requestedLanguage,
          previous: joined(earlier?.map((segment) => segment.text) ?? []),
          createdAt,
        });
  const transcribeMs = own?.transcribeMs ?? 0;
  const ownSilent = own === undefined || deps.isSilence({ text: own.text, quiet: !!level?.quiet });
  const raw =
    earlier === undefined
      ? (own?.text ?? "")
      : joined([...earlier.map((segment) => segment.text), ownSilent ? "" : own.text]);
  const audioSeconds = (ownSeconds ?? 0) + segmentSeconds;
  const segments = earlier?.length ?? 0;

  if (earlier === undefined ? ownSilent : raw === "") {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("dictation skipped", {
      skipped: "silence",
      stage: "transcript",
      quiet: !!level?.quiet,
      sustainedLevelDbfs: level?.dbfs,
      audioSeconds,
      segments,
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

  const language: Language =
    own?.language ??
    (requestedLanguage !== undefined && languages.includes(requestedLanguage)
      ? requestedLanguage
      : (languages[0] ?? "en"));
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
    sustainedLevelDbfs: level?.dbfs,
    transcriber: providers.transcriber,
    refiner: providers.refiner,
    styleId: style.id,
    language,
    transcriptions: own?.transcriptions ?? "",
    promptTerms: own?.promptTerms ?? 0,
    promptTailBytes: own?.promptTailBytes ?? 0,
    segments,
    segmentSeconds,
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

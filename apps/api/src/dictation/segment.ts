import type { SegmentResponse } from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";
import { quotaExceededMessage, quotaWindow } from "./quota.ts";
import { issueReceipt } from "./receipt.ts";
import { levelOf, probe, timed, transcribe, type DictateDeps } from "./stages.ts";
import type { SegmentUpload } from "./upload.ts";

export interface SegmentRequest {
  userId: string;
  upload: SegmentUpload;
}

export async function transcribeSegment(
  { userId, upload }: SegmentRequest,
  deps: DictateDeps,
): Promise<SegmentResponse> {
  const key = deps.receipts;
  if (key === undefined) {
    throw new HttpError("not_found", "This server does not transcribe segments.");
  }
  const startedAt = deps.elapsed();
  const createdAt = deps.now();
  const { meta, audio, previous } = upload;
  const probed = probe(audio, { allowShort: false });
  if (probed === undefined) throw new HttpError("bad_request", "The audio part is too short.");
  const level = levelOf(probed, deps.silenceLevels);
  if (level.silent) {
    const totalMs = Math.round(deps.elapsed() - startedAt);
    deps.log.info("segment skipped", {
      skipped: "silence",
      stage: "level",
      sustainedLevelDbfs: level.dbfs,
      audioSeconds: probed.seconds,
      totalMs,
    });
    return { raw: "", skipped: "silence", providers: {}, latencyMs: { total: totalMs } };
  }

  const window = quotaWindow(createdAt);
  const [[used, checkMs], [profile, profileMs]] = await Promise.all([
    timed(deps, () => deps.usage.usedSeconds(userId, window.day)),
    timed(deps, () => deps.profile.load(userId, undefined)),
  ]);
  if (used >= deps.dailyQuotaMinutes * 60) {
    deps.log.info("quota exceeded", {
      audioSeconds: probed.seconds,
      quotaMs: checkMs,
      segment: true,
    });
    throw new HttpError("quota_exceeded", quotaExceededMessage(deps.dailyQuotaMinutes));
  }

  const transcription = await transcribe(deps, {
    audio,
    profile,
    language: meta.language,
    previous,
    createdAt,
  });
  const [, chargeMs] = await timed(deps, () =>
    deps.quota.charge({
      userId,
      day: window.day,
      seconds: probed.seconds,
      capSeconds: undefined,
      expiresAt: window.expiresAt,
    }),
  );
  const quotaMs = checkMs + chargeMs;
  const silent = deps.isSilence({ text: transcription.text, quiet: level.quiet });
  const raw = silent ? "" : transcription.text;
  const receipt = issueReceipt(key.secret, userId, raw, {
    seconds: probed.seconds,
    language: transcription.language,
    issuedAt: Math.floor(createdAt.getTime() / 1000),
  });
  const totalMs = Math.round(deps.elapsed() - startedAt);
  const transcriber = transcription.transcriber;
  deps.log.info(silent ? "segment skipped" : "segment done", {
    ...(silent && { skipped: "silence", stage: "transcript", quiet: level.quiet }),
    audioSeconds: probed.seconds,
    sustainedLevelDbfs: level.dbfs,
    transcriber,
    language: transcription.language,
    transcriptions: transcription.transcriptions,
    promptTerms: transcription.promptTerms,
    promptTailBytes: transcription.promptTailBytes,
    quotaMs,
    profileMs,
    transcribeMs: transcription.transcribeMs,
    totalMs,
  });
  return {
    raw,
    ...(silent && { skipped: "silence" as const }),
    language: transcription.language,
    receipt,
    providers: { transcriber },
    latencyMs: {
      quota: quotaMs,
      profile: profileMs,
      transcribe: transcription.transcribeMs,
      total: totalMs,
    },
  };
}

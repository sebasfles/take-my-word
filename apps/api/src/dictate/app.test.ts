import {
  apiErrorSchema,
  dictationResponseSchema,
  maxAudioBytes,
  type ApiError,
  type DictationResponse,
} from "@take-my-word/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { DictationRecord } from "../dictation/dictation-store.ts";
import type { DictationProfile } from "../dictation/profile.ts";
import { ProviderError } from "../dictation/ports/provider-error.ts";
import type { RefineInput } from "../dictation/ports/refiner.ts";
import type { TranscribeInput } from "../dictation/ports/transcriber.ts";
import type { QuotaCharge } from "../dictation/quota.ts";
import { createSilenceGuard, defaultSilenceLevels } from "../dictation/silence.ts";
import { createLogger } from "../lib/log.ts";
import { createMetrics } from "../lib/metrics.ts";
import { m4a, wav } from "../testing/audio.ts";
import { dictationBody, multipartContentType } from "../testing/multipart.ts";
import { createDictateHandler, type DictateEvent } from "./app.ts";

const rawTranscript = "eh bueno este quería decir que mañana nos vemos";
const cleanText = "Quería decir que mañana nos vemos.";
const whisper = "groq-whisper:whisper-large-v3-turbo";
const speech = (seconds: number) => wav({ seconds, toneDbfs: -20 });

class World {
  now = new Date("2026-10-20T15:00:00.000Z");
  clock = 0;
  transcript = { text: rawTranscript };
  transcribeError: Error | undefined;
  transcribed: TranscribeInput[] = [];
  refined: RefineInput[] = [];
  saved: DictationRecord[] = [];
  used = new Map<string, number>();
  charges: QuotaCharge[] = [];
  lines: string[] = [];
  profile: DictationProfile = { styles: [], terms: [] };
  profileLoads: { userId: string; appId: string | undefined }[] = [];

  handler = createDictateHandler({
    providers: {
      transcribers: {
        "groq-whisper": {
          label: whisper,
          transcribe: (input) => {
            this.transcribed.push(input);
            this.clock += 300;
            if (this.transcribeError) return Promise.reject(this.transcribeError);
            return Promise.resolve(this.transcript);
          },
        },
      },
      refiners: {
        openai: {
          label: "openai:gpt-5.4-nano",
          refine: (input) => {
            this.refined.push(input);
            this.clock += 400;
            return Promise.resolve({
              text: cleanText,
              usage: { inputTokens: 150, outputTokens: 9 },
            });
          },
        },
      },
    },
    quota: {
      charge: (charge) => {
        this.charges.push(charge);
        const key = `${charge.userId}/${charge.day}`;
        const used = this.used.get(key);
        if (used !== undefined && used >= charge.capSeconds) return Promise.resolve(false);
        this.used.set(key, (used ?? 0) + charge.seconds);
        return Promise.resolve(true);
      },
    },
    dailyQuotaMinutes: 60,
    dictations: {
      save: (record) => {
        this.saved.push(record);
        return Promise.resolve();
      },
    },
    profile: {
      load: (userId, appId) => {
        this.profileLoads.push({ userId, appId });
        return Promise.resolve(this.profile);
      },
    },
    dictionary: { halfLifeDays: 30, promptTokenBudget: 224 },
    isSilence: createSilenceGuard(),
    silenceLevels: defaultSilenceLevels,
    metrics: createMetrics((line) => this.lines.push(line)),
    log: createLogger({}, (line) => this.lines.push(line)),
    now: () => this.now,
    elapsed: () => this.clock,
  });

  async post(body: Buffer, contentType = multipartContentType) {
    const event = {
      headers: { "content-type": contentType },
      body: body.toString("base64"),
      isBase64Encoded: true,
      requestContext: { authorizer: { lambda: { userId: "user-1" } } },
    } as unknown as DictateEvent;
    const result = await this.handler(event, { awsRequestId: `req-${this.saved.length}` });
    return { status: result.statusCode, json: JSON.parse(result.body ?? "") as unknown };
  }

  logs(): Record<string, unknown>[] {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

let world: World;
beforeEach(() => {
  world = new World();
});

function ok(json: unknown): DictationResponse {
  return dictationResponseSchema.parse(json);
}

function failure(json: unknown): ApiError["error"] {
  return apiErrorSchema.parse(json).error;
}

describe("POST /dictations", () => {
  it("transcribes, refines, saves and answers raw, text, providers and stage latency", async () => {
    const { status, json } = await world.post(dictationBody({ audio: speech(7) }));
    expect(status).toBe(200);
    const body = ok(json);
    expect(body).toMatchObject({
      raw: rawTranscript,
      text: cleanText,
      providers: { transcriber: whisper, refiner: "openai:gpt-5.4-nano" },
      latencyMs: { transcribe: 300, refine: 400, total: 700 },
    });
    expect(body.skipped).toBeUndefined();
    expect(world.transcribed[0]).toMatchObject({ container: "wav", language: "es" });
    expect(world.refined[0]?.raw).toBe(rawTranscript);
    expect(world.saved).toHaveLength(1);
    expect(world.saved[0]).toMatchObject({
      userId: "user-1",
      audioSeconds: 7,
      raw: rawTranscript,
      text: cleanText,
      tokens: { inputTokens: 150, outputTokens: 9 },
    });
  });

  it("passes m4a to the transcriber as m4a and English locales as English", async () => {
    const body = dictationBody({
      audio: m4a({ seconds: 5 }),
      audioType: "audio/mp4",
      meta: { locale: "en-US" },
    });
    const { status } = await world.post(body);
    expect(status).toBe(200);
    expect(world.transcribed[0]).toMatchObject({ container: "m4a", language: "en" });
    expect(world.refined[0]?.instructions).not.toEqual(expect.stringContaining("español"));
  });

  it("skips a WAV under the level floor before any provider call and charges nothing", async () => {
    const audio = wav({ seconds: 2, toneDbfs: -70, clicks: 3 });
    const { status, json } = await world.post(dictationBody({ audio }));
    expect(status).toBe(200);
    const body = ok(json);
    expect(body).toMatchObject({ raw: "", text: "", skipped: "silence", providers: {} });
    expect(world.transcribed).toHaveLength(0);
    expect(world.refined).toHaveLength(0);
    expect(world.charges).toHaveLength(0);
    expect(world.saved).toHaveLength(0);
    expect(world.logs()).toContainEqual(
      expect.objectContaining({ message: "dictation skipped", stage: "level" }),
    );
  });

  it("skips a hallucination on speech-level audio, charged, without refining or saving", async () => {
    world.transcript = { text: "Subtítulos realizados por la comunidad de Amara.org" };
    const { status, json } = await world.post(dictationBody({ audio: speech(2) }));
    expect(status).toBe(200);
    expect(ok(json)).toMatchObject({
      text: "",
      skipped: "silence",
      providers: { transcriber: whisper },
    });
    expect(world.refined).toHaveLength(0);
    expect(world.saved).toHaveLength(0);
    expect(world.used.get("user-1/2026-10-20")).toBe(2);
  });

  it("skips an ambiguous phrase on quiet audio above the floor", async () => {
    world.transcript = { text: "Gracias." };
    const audio = wav({ seconds: 2, toneDbfs: -45 });
    const { status, json } = await world.post(dictationBody({ audio }));
    expect(status).toBe(200);
    expect(ok(json).skipped).toBe("silence");
    expect(world.transcribed).toHaveLength(1);
    expect(world.refined).toHaveLength(0);
    expect(world.logs()).toContainEqual(
      expect.objectContaining({ message: "dictation skipped", stage: "transcript", quiet: true }),
    );
  });

  it("refines a spoken one-word reply on speech-level audio", async () => {
    world.transcript = { text: "Gracias." };
    const { status, json } = await world.post(dictationBody({ audio: speech(2) }));
    expect(status).toBe(200);
    expect(ok(json).skipped).toBeUndefined();
    expect(world.refined[0]?.raw).toBe("Gracias.");
    expect(world.saved).toHaveLength(1);
  });

  it("refines an ambiguous phrase from m4a, whose level is not measured", async () => {
    world.transcript = { text: "Gracias." };
    const body = dictationBody({ audio: m4a({ seconds: 2 }), audioType: "audio/mp4" });
    expect((await world.post(body)).status).toBe(200);
    expect(world.refined[0]?.raw).toBe("Gracias.");
  });

  it("answers 400 without charging a recording under half a second", async () => {
    const { status, json } = await world.post(dictationBody({ audio: speech(0.3) }));
    expect(status).toBe(400);
    expect(failure(json).message).toBe("Recordings under 0.5 s are not transcribed.");
    expect(world.charges).toHaveLength(0);
    expect(world.transcribed).toHaveLength(0);
  });

  it("charges a WAV by the bytes sent when its header claims no data", async () => {
    await world.post(
      dictationBody({ audio: wav({ seconds: 20, declaredDataSize: 0, toneDbfs: -20 }) }),
    );
    expect(world.charges[0]?.seconds).toBe(20);
  });

  it("charges an m4a at least its payload at 320 kbps when its header claims less", async () => {
    const lying = m4a({ seconds: 1 / 44_100, mediaBytes: 800_000 });
    const body = dictationBody({ audio: lying, audioType: "audio/mp4" });
    expect((await world.post(body)).status).toBe(200);
    expect(world.charges[0]?.seconds).toBeGreaterThanOrEqual(20);
  });

  it("charges the real duration and allows requests while the day is under the cap", async () => {
    world.used.set("user-1/2026-10-20", 3599);
    const first = await world.post(dictationBody({ audio: speech(30) }));
    expect(first.status).toBe(200);
    expect(world.charges[0]).toMatchObject({ seconds: 30, capSeconds: 3600, day: "2026-10-20" });
    expect(world.used.get("user-1/2026-10-20")).toBe(3629);
  });

  it("answers 429 naming the daily limit once the cap is reached, before any provider call", async () => {
    world.used.set("user-1/2026-10-20", 3600);
    const { status, json } = await world.post(dictationBody({ audio: speech(3) }));
    expect(status).toBe(429);
    expect(failure(json)).toEqual({
      code: "quota_exceeded",
      message: "Daily limit of 60 minutes of audio reached; it resets at 00:00 UTC.",
    });
    expect(world.transcribed).toHaveLength(0);
  });

  it("allows the user again after UTC midnight", async () => {
    world.used.set("user-1/2026-10-20", 3600);
    world.now = new Date("2026-10-21T00:00:00.000Z");
    const { status } = await world.post(dictationBody({ audio: speech(3) }));
    expect(status).toBe(200);
  });

  it("answers 400 without charging when the audio does not parse as its declared container", async () => {
    const body = dictationBody({ audio: m4a({ seconds: 3 }), audioType: "audio/wav" });
    const { status, json } = await world.post(body);
    expect(status).toBe(400);
    expect(failure(json).code).toBe("bad_request");
    expect(world.charges).toHaveLength(0);
  });

  it("answers 413 for audio over the limit and 415 for other content types", async () => {
    const big = await world.post(dictationBody({ audio: Buffer.alloc(maxAudioBytes + 1) }));
    expect(big.status).toBe(413);
    const json = await world.post(Buffer.from("{}"), "application/json");
    expect(json.status).toBe(415);
    expect(world.charges).toHaveLength(0);
  });

  it("answers 502 when a provider fails, records the error metric and saves nothing", async () => {
    world.transcribeError = new ProviderError(whisper, `${whisper} answered 503`, 503);
    const { status, json } = await world.post(dictationBody({ audio: speech(3) }));
    expect(status).toBe(502);
    expect(failure(json).code).toBe("provider_failed");
    expect(world.saved).toHaveLength(0);
    expect(world.logs()).toContainEqual(expect.objectContaining({ Provider: whisper, Errors: 1 }));
  });

  it("answers 500 without details on an unexpected failure", async () => {
    world.transcribeError = new TypeError("boom");
    const { status, json } = await world.post(dictationBody({ audio: speech(3) }));
    expect(status).toBe(500);
    expect(failure(json)).toEqual({
      code: "internal",
      message: "Something went wrong; try again.",
    });
  });

  it("emits one metric per provider call with latency and tokens", async () => {
    await world.post(dictationBody({ audio: speech(3) }));
    const metrics = world.logs().filter((line) => "_aws" in line);
    expect(metrics).toEqual([
      expect.objectContaining({ Provider: whisper, Latency: 300, Errors: 0 }),
      expect.objectContaining({
        Provider: "openai:gpt-5.4-nano",
        Latency: 400,
        InputTokens: 150,
        OutputTokens: 9,
        Errors: 0,
      }),
    ]);
  });

  it("never logs the transcript or the clean text", async () => {
    await world.post(dictationBody({ audio: speech(3) }));
    world.transcript = { text: "[Music]" };
    await world.post(dictationBody({ audio: speech(3) }));
    const everything = world.lines.join("\n");
    expect(everything).not.toContain("mañana nos vemos");
    expect(everything).not.toContain("Music");
    expect(world.logs()).toContainEqual(
      expect.objectContaining({
        message: "dictation done",
        requestId: "req-0",
        userId: "user-1",
        totalMs: 700,
      }),
    );
  });
});

describe("POST /dictations with the user's dictionary, styles and settings", () => {
  const term = (name: string, aliases: string[], useCount: number, lastUsedAt: string) => ({
    key: name.toLowerCase(),
    term: name,
    aliases,
    useCount,
    lastUsedAt,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  const settings = (defaultStyleId: string) => ({
    defaultStyleId,
    locale: "es",
    providers: { transcriber: "groq-whisper" as const, refiner: "openai" as const },
  });
  const post = (meta: Record<string, unknown>) =>
    world.post(dictationBody({ audio: speech(3), meta: { locale: "es", ...meta } }));

  it("uses plain and sends no prompt for a user with nothing configured", async () => {
    const { json } = await post({});
    expect(ok(json).styleId).toBe("plain");
    expect(world.saved[0]?.styleId).toBe("plain");
    expect(world.transcribed[0]?.prompt).toBeUndefined();
  });

  it("steers Whisper with the top terms and gives the refiner every term with its aliases", async () => {
    world.profile.terms = [
      term("Kubernetes", ["cubernetes"], 9, "2026-10-19T00:00:00.000Z"),
      term("Zentrafolk", [], 1, "2026-10-20T00:00:00.000Z"),
      term("Viejo", [], 50, "2025-01-01T00:00:00.000Z"),
    ];
    await post({});
    expect(world.transcribed[0]?.prompt).toBe("Kubernetes, Zentrafolk, Viejo");
    expect(world.refined[0]?.instructions).toContain("- Kubernetes (cubernetes)");
    expect(world.refined[0]?.instructions).toContain("- Viejo");
  });

  it("resolves the style from the request, then the app rule, then the default", async () => {
    world.profile = {
      settings: settings("mine"),
      rule: { appId: "notepad.exe", styleId: "formal", keystroke: "ctrl+v" },
      styles: [{ id: "mine", prompt: "Write like a pirate." }],
      terms: [],
    };
    expect(ok((await post({ styleId: "casual", appId: "Notepad.exe" })).json).styleId).toBe(
      "casual",
    );
    expect(ok((await post({ appId: "Notepad.exe" })).json).styleId).toBe("formal");
    expect(world.profileLoads[1]).toEqual({ userId: "user-1", appId: "notepad.exe" });
    world.profile = { ...world.profile, rule: { appId: "notepad.exe", keystroke: "ctrl+v" } };
    expect(ok((await post({ appId: "notepad.exe" })).json).styleId).toBe("mine");
    expect(world.refined[2]?.instructions).toContain("Write like a pirate.");
    expect(world.saved.map((record) => record.styleId)).toEqual(["casual", "formal", "mine"]);
  });

  it("never fails a dictation over a deleted style id", async () => {
    world.profile = { settings: settings("deleted"), styles: [], terms: [] };
    const { status, json } = await post({ styleId: "also-deleted" });
    expect(status).toBe(200);
    expect(ok(json).styleId).toBe("plain");
  });

  it("charges the quota and reads the profile in the same round trip and reports both", async () => {
    const { json } = await post({});
    expect(world.profileLoads).toHaveLength(1);
    expect(ok(json).latencyMs).toMatchObject({ quota: 0, profile: 0 });
    expect(world.saved[0]?.latencyMs).toMatchObject({ profile: 0 });
  });

  it("reads nothing for a WAV skipped under the level floor", async () => {
    await world.post(dictationBody({ audio: wav({ seconds: 2, toneDbfs: -70 }) }));
    expect(world.profileLoads).toHaveLength(0);
  });
});

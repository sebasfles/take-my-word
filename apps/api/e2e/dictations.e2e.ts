import {
  apiErrorSchema,
  dictationResponseSchema,
  historyPageSchema,
  maxAudioBytes,
  settingsSchema,
  type ApiError,
  type Language,
} from "@take-my-word/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmDevice, forgetDevice, refresh } from "@take-my-word/cognito";
import {
  crewE2eConfig,
  requiredEnv,
  signInCrewE2e,
  signInCrewE2eSession,
} from "../scripts/sign-in.ts";
import { wav } from "../src/testing/audio.ts";
import { synthesize } from "./speech.ts";

const fillers = /\b(eh|este|mmm)\b/i;
let url: string;
let token: string;
let speech: Buffer;

async function post(
  parts: { meta?: unknown; audio?: Buffer; audioType?: string },
  auth: string | null = token,
) {
  const form = new FormData();
  if (parts.meta !== undefined) form.append("meta", JSON.stringify(parts.meta));
  if (parts.audio) {
    form.append(
      "audio",
      new Blob([new Uint8Array(parts.audio)], { type: parts.audioType ?? "audio/wav" }),
      "dictation",
    );
  }
  const response = await fetch(`${url}/dictations`, {
    method: "POST",
    headers: auth === null ? {} : { authorization: `Bearer ${auth}` },
    body: form,
  });
  return { status: response.status, json: await response.json() };
}

function errorOf(json: unknown): ApiError["error"] {
  return apiErrorSchema.parse(json).error;
}

beforeAll(async () => {
  token = await signInCrewE2e();
  url = requiredEnv("API_URL");
  speech = await synthesize(
    "Eh, bueno, este, quería decirte que, mmm, mañana nos vemos a las tres en la oficina.",
  );
});

describe("POST /dictations in a deployed environment", () => {
  it("answers 401 without a token and 403 with a forged one", async () => {
    expect((await post({ meta: { locale: "es" }, audio: speech }, null)).status).toBe(401);
    expect((await post({ meta: { locale: "es" }, audio: speech }, "not.a.jwt")).status).toBe(403);
  });

  it("turns Spanish speech with fillers into clean text", async () => {
    const { status, json } = await post({ meta: { locale: "es-CO" }, audio: speech });
    expect(status).toBe(200);
    const body = dictationResponseSchema.parse(json);
    expect(body.raw).toMatch(fillers);
    expect(body.text).toMatch(/mañana/i);
    expect(body.text).not.toMatch(fillers);
    expect(body.providers.transcriber).toMatch(/^groq-whisper:/);
    expect(body.providers.refiner).toMatch(/^openai:/);
  });

  it("skips near-silence without transcribing it", async () => {
    const { status, json } = await post({
      meta: { locale: "es" },
      audio: wav({ seconds: 2, toneDbfs: -70 }),
    });
    expect(status).toBe(200);
    expect(dictationResponseSchema.parse(json)).toMatchObject({
      text: "",
      skipped: "silence",
      providers: {},
    });
  });

  it("answers 413 for audio over the limit", async () => {
    const big = wav({ seconds: Math.ceil(maxAudioBytes / 32_000) + 1 });
    const { status, json } = await post({ meta: { locale: "es" }, audio: big });
    expect(status).toBe(413);
    expect(errorOf(json).code).toBe("payload_too_large");
  });

  it("answers 415 for an unsupported audio type", async () => {
    const { status } = await post({
      meta: { locale: "es" },
      audio: speech,
      audioType: "audio/ogg",
    });
    expect(status).toBe(415);
  });

  it("answers 400 for a missing meta part and for an unknown provider", async () => {
    expect((await post({ audio: speech })).status).toBe(400);
    const unknown = await post({ meta: { locale: "es", refineProvider: "nope" }, audio: speech });
    expect(unknown.status).toBe(400);
  });

  it("refreshes a confirmed device's session with rotation and rejects the old refresh token after the grace period", async () => {
    const { userPoolId, clientId } = crewE2eConfig();
    const first = await signInCrewE2eSession();
    const deviceKey = await confirmDevice({ userPoolId, session: first, deviceName: "crew-e2e" });
    try {
      const second = await refresh({
        userPoolId,
        clientId,
        refreshToken: first.refreshToken,
        deviceKey,
      });
      expect(second.accessToken).not.toBe(first.accessToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      const { status } = await post({ meta: { locale: "es" }, audio: speech }, second.accessToken);
      expect(status).toBe(200);

      await new Promise((resolve) => setTimeout(resolve, 12_000));
      await expect(
        refresh({ userPoolId, clientId, refreshToken: first.refreshToken, deviceKey }),
      ).rejects.toThrow(/reuse detected/i);
      const third = await refresh({
        userPoolId,
        clientId,
        refreshToken: second.refreshToken,
        deviceKey,
      });
      expect(third.refreshToken).not.toBe(second.refreshToken);
    } finally {
      await forgetDevice({ userPoolId, accessToken: first.accessToken, deviceKey });
    }
  }, 60_000);
});

describe("dictation languages in a deployed environment", () => {
  let english: Buffer;
  let spanish: Buffer;
  let stored: unknown;

  async function settings(method: "GET" | "PUT", body?: unknown) {
    const response = await fetch(`${url}/me/settings`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return settingsSchema.parse(await response.json());
  }

  async function dictateIn(languages: Language[], audio: Buffer) {
    const current = await settings("GET");
    await settings("PUT", { ...current, dictationLanguages: languages });
    const { status, json } = await post({ meta: {}, audio });
    expect(status).toBe(200);
    const text = dictationResponseSchema.parse(json).text;
    const history = await fetch(`${url}/dictations?limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const newest = historyPageSchema.parse(await history.json()).items[0];
    return { text, locale: newest?.locale };
  }

  beforeAll(async () => {
    stored = await settings("GET");
    [english, spanish] = await Promise.all([
      synthesize("Let's meet tomorrow at three in the office, and bring the report.", "en"),
      synthesize("Nos vemos mañana a las tres en la oficina, y trae el informe.", "es"),
    ]);
  }, 60_000);

  afterAll(async () => {
    await settings("PUT", stored);
  });

  it("transcribes English with English only", async () => {
    const { text, locale } = await dictateIn(["en"], english);
    expect(text).toMatch(/tomorrow/i);
    expect(locale).toBe("en");
  }, 60_000);

  it("transcribes Spanish with Spanish only", async () => {
    const { text, locale } = await dictateIn(["es"], spanish);
    expect(text).toMatch(/mañana/i);
    expect(locale).toBe("es");
  }, 60_000);

  it("detects each language when both are chosen", async () => {
    const first = await dictateIn(["en", "es"], english);
    expect(first.text).toMatch(/tomorrow/i);
    expect(first.locale).toBe("en");
    const second = await dictateIn(["en", "es"], spanish);
    expect(second.text).toMatch(/mañana/i);
    expect(second.locale).toBe("es");
  }, 60_000);
});

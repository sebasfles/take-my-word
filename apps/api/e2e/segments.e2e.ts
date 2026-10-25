import {
  dictationResponseSchema,
  historyPageSchema,
  segmentResponseSchema,
  segmentsPath,
} from "@take-my-word/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { requiredEnv, signInCrewE2e } from "../scripts/sign-in.ts";
import { synthesize } from "./speech.ts";

let url: string;
let token: string;

async function send(path: string, parts: Record<string, string | Buffer>) {
  const form = new FormData();
  for (const [name, value] of Object.entries(parts)) {
    if (typeof value === "string") form.append(name, value);
    else form.append(name, new Blob([new Uint8Array(value)], { type: "audio/wav" }), "audio.wav");
  }
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, json: await response.json() };
}

beforeAll(async () => {
  token = await signInCrewE2e();
  url = requiredEnv("API_URL");
});

describe("segmented dictation in a deployed environment", () => {
  it("transcribes segments to raw text and refines the take once with the last part", async () => {
    const [first, last] = await Promise.all([
      synthesize("Mañana revisamos el informe trimestral con todo el equipo de ventas."),
      synthesize("Y después preparamos la presentación para el cliente."),
    ]);
    const segment = await send(segmentsPath, { meta: "{}", audio: first });
    expect(segment.status).toBe(200);
    const body = segmentResponseSchema.parse(segment.json);
    expect(body.raw).toMatch(/informe/i);
    expect(body.receipt).toEqual(expect.any(String));

    const final = await send("/dictations", {
      meta: JSON.stringify({ language: body.language }),
      segments: JSON.stringify([{ text: body.raw, receipt: body.receipt }]),
      audio: last,
    });
    expect(final.status).toBe(200);
    const dictation = dictationResponseSchema.parse(final.json);
    expect(dictation.text).toMatch(/informe/i);
    expect(dictation.text).toMatch(/presentación/i);

    const history = await fetch(`${url}/dictations?limit=1`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const newest = historyPageSchema.parse(await history.json()).items[0];
    expect(newest?.text).toBe(dictation.text);
  }, 60_000);

  it("refuses a final whose receipt does not match its text", async () => {
    const audio = await synthesize("Una frase corta para probar el recibo.");
    const body = segmentResponseSchema.parse(
      (await send(segmentsPath, { meta: "{}", audio })).json,
    );
    const final = await send("/dictations", {
      meta: "{}",
      segments: JSON.stringify([{ text: `${body.raw} extra`, receipt: body.receipt }]),
      audio,
    });
    expect(final.status).toBe(400);
  }, 60_000);
});

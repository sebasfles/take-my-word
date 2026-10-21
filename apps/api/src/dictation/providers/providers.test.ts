import { describe, expect, it } from "vitest";
import { ProviderError } from "../ports/provider-error.ts";
import { groqWhisper } from "./groq-whisper.ts";
import type { Fetch } from "./http.ts";
import { openaiRefiner } from "./openai.ts";

interface Captured {
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(status: number, json: unknown): { fetch: Fetch; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetch: Fetch = (_input, init) => {
    captured.push({
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    return Promise.resolve(Response.json(json, { status }));
  };
  return { fetch, captured };
}

const apiKey = () => Promise.resolve("secret-key");

describe("groq-whisper transcriber", () => {
  it("labels itself with its model", () => {
    expect(groqWhisper({ apiKey }).label).toBe("groq-whisper:whisper-large-v3-turbo");
    expect(groqWhisper({ apiKey, model: "whisper-large-v3" }).label).toBe(
      "groq-whisper:whisper-large-v3",
    );
  });

  it("sends the audio with model and language and returns the trimmed text", async () => {
    const { fetch, captured } = fakeFetch(200, { text: " Hola, mundo. " });
    const transcriber = groqWhisper({ apiKey, fetch, model: "whisper-large-v3" });
    const result = await transcriber.transcribe({
      audio: Buffer.from("RIFF"),
      container: "wav",
      language: "es",
    });
    expect(result).toEqual({ text: "Hola, mundo." });
    const form = captured[0]?.body as FormData;
    expect(captured[0]?.headers.authorization).toBe("Bearer secret-key");
    expect(form.get("model")).toBe("whisper-large-v3");
    expect(form.get("language")).toBe("es");
    expect(form.get("response_format")).toBe("json");
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.wav");
    expect(Buffer.from(await file.arrayBuffer()).toString()).toBe("RIFF");
  });

  it("fails with the status and without the provider's body", async () => {
    const { fetch } = fakeFetch(429, { error: { message: "rate limited for key secret-key" } });
    const failure = groqWhisper({ apiKey, fetch }).transcribe({
      audio: Buffer.alloc(1),
      container: "m4a",
      language: "en",
    });
    await expect(failure).rejects.toThrow(ProviderError);
    await expect(failure).rejects.toThrow(/^groq-whisper:whisper-large-v3-turbo answered 429$/);
  });

  it("fails on an unexpected shape", async () => {
    const { fetch } = fakeFetch(200, { transcript: "hola" });
    const failure = groqWhisper({ apiKey, fetch }).transcribe({
      audio: Buffer.alloc(1),
      container: "wav",
      language: "es",
    });
    await expect(failure).rejects.toThrow(ProviderError);
  });
});

const completed = {
  status: "completed",
  output: [
    { type: "reasoning", summary: [] },
    {
      type: "message",
      content: [
        { type: "output_text", text: "Hola, " },
        { type: "output_text", text: "mundo." },
      ],
    },
  ],
  usage: { input_tokens: 120, output_tokens: 6 },
};

describe("openai refiner", () => {
  it("labels itself with its model", () => {
    expect(openaiRefiner({ apiKey, model: "gpt-6-luna" }).label).toBe("openai:gpt-6-luna");
  });

  it("sends the transcript as input under the instructions and maps text and usage", async () => {
    const { fetch, captured } = fakeFetch(200, completed);
    const refiner = openaiRefiner({ apiKey, fetch });
    const result = await refiner.refine({
      raw: "eh hola mundo",
      language: "es",
      instructions: "clean",
    });
    expect(result).toEqual({ text: "Hola, mundo.", usage: { inputTokens: 120, outputTokens: 6 } });
    const body = JSON.parse(String(captured[0]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.4-nano",
      instructions: "clean",
      input: "eh hola mundo",
      store: false,
    });
  });

  it("fails when the response is incomplete instead of returning partial text", async () => {
    const { fetch } = fakeFetch(200, { ...completed, status: "incomplete" });
    const failure = openaiRefiner({ apiKey, fetch }).refine({
      raw: "x",
      language: "es",
      instructions: "i",
    });
    await expect(failure).rejects.toThrow(ProviderError);
  });

  it("fails with the status on an error answer", async () => {
    const { fetch } = fakeFetch(401, { error: { message: "bad key" } });
    const failure = openaiRefiner({ apiKey, fetch }).refine({
      raw: "x",
      language: "es",
      instructions: "i",
    });
    await expect(failure).rejects.toThrow(/answered 401$/);
  });
});

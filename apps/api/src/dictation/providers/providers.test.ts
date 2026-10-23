import { describe, expect, it } from "vitest";
import { ProviderError } from "../ports/provider-error.ts";
import { groqChatRefiner } from "./groq-chat.ts";
import { groqWhisper } from "./groq-whisper.ts";
import type { Fetch } from "./http.ts";
import { openaiTranscriber } from "./openai-transcribe.ts";
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

  it("asks for detection without a language and reports the detected one", async () => {
    const { fetch, captured } = fakeFetch(200, { text: "Hello.", language: "English" });
    const transcriber = groqWhisper({ apiKey, fetch });
    const result = await transcriber.transcribe({ audio: Buffer.from("RIFF"), container: "wav" });
    expect(result).toEqual({ text: "Hello.", language: "en" });
    const form = captured[0]?.body as FormData;
    expect(form.get("language")).toBeNull();
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("reports no language when the detected one is neither Spanish nor English", async () => {
    const { fetch } = fakeFetch(200, { text: "Bonjour.", language: "french" });
    const result = await groqWhisper({ apiKey, fetch }).transcribe({
      audio: Buffer.from("RIFF"),
      container: "wav",
    });
    expect(result).toEqual({ text: "Bonjour." });
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

  it("sends no reasoning or temperature unless asked, and both when asked", async () => {
    const plain = fakeFetch(200, completed);
    await openaiRefiner({ apiKey, fetch: plain.fetch }).refine({
      raw: "x",
      language: "es",
      instructions: "i",
    });
    const plainBody = JSON.parse(String(plain.captured[0]?.body)) as Record<string, unknown>;
    expect(plainBody).not.toHaveProperty("reasoning");
    expect(plainBody).not.toHaveProperty("temperature");

    const tuned = fakeFetch(200, completed);
    await openaiRefiner({
      apiKey,
      fetch: tuned.fetch,
      model: "gpt-6-luna",
      reasoningEffort: "none",
      temperature: 0,
    }).refine({ raw: "x", language: "es", instructions: "i" });
    expect(JSON.parse(String(tuned.captured[0]?.body))).toMatchObject({
      model: "gpt-6-luna",
      reasoning: { effort: "none" },
      temperature: 0,
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

describe("openai-transcribe transcriber", () => {
  it("labels itself with its model", () => {
    expect(openaiTranscriber({ apiKey, model: "gpt-transcribe" }).label).toBe(
      "openai-transcribe:gpt-transcribe",
    );
  });

  it("sends audio, model, language and prompt and returns the trimmed text", async () => {
    const { fetch, captured } = fakeFetch(200, { text: " Hola. ", usage: { type: "tokens" } });
    const result = await openaiTranscriber({
      apiKey,
      fetch,
      model: "gpt-4o-mini-transcribe",
    }).transcribe({ audio: Buffer.from("RIFF"), container: "wav", language: "es", prompt: "PR" });
    expect(result).toEqual({ text: "Hola." });
    const form = captured[0]?.body as FormData;
    expect(captured[0]?.headers.authorization).toBe("Bearer secret-key");
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("es");
    expect(form.get("prompt")).toBe("PR");
    expect(form.get("response_format")).toBe("json");
    expect((form.get("file") as File).name).toBe("audio.wav");
  });

  it("sends the language as languages[] when the model takes a list", async () => {
    const { fetch, captured } = fakeFetch(200, { text: "Hola.", languages: [{ code: "es" }] });
    const result = await openaiTranscriber({
      apiKey,
      fetch,
      model: "gpt-transcribe",
      languageField: "languages[]",
    }).transcribe({ audio: Buffer.from("RIFF"), container: "wav", language: "es" });
    expect(result).toEqual({ text: "Hola." });
    const form = captured[0]?.body as FormData;
    expect(form.getAll("languages[]")).toEqual(["es"]);
    expect(form.get("language")).toBeNull();
  });

  it("reports the first detected language without a requested one", async () => {
    const { fetch, captured } = fakeFetch(200, {
      text: "Hello.",
      languages: [{ code: "en" }, { code: "es" }],
    });
    const result = await openaiTranscriber({ apiKey, fetch, model: "gpt-transcribe" }).transcribe({
      audio: Buffer.from("RIFF"),
      container: "m4a",
    });
    expect(result).toEqual({ text: "Hello.", language: "en" });
    const form = captured[0]?.body as FormData;
    expect(form.get("language")).toBeNull();
    expect((form.get("file") as File).type).toBe("audio/mp4");
  });

  it("reports no language when the model detects none or another one", async () => {
    for (const languages of [undefined, [], [{ code: "fr" }]]) {
      const { fetch } = fakeFetch(200, { text: "x", ...(languages && { languages }) });
      const result = await openaiTranscriber({
        apiKey,
        fetch,
        model: "gpt-4o-transcribe",
      }).transcribe({
        audio: Buffer.from("RIFF"),
        container: "wav",
      });
      expect(result).toEqual({ text: "x" });
    }
  });

  it("returns the usage the model is billed by, tokens or seconds", async () => {
    const tokens = fakeFetch(200, {
      text: "Hola.",
      usage: {
        type: "tokens",
        input_tokens: 20,
        input_token_details: { text_tokens: 0, audio_tokens: 20 },
        output_tokens: 10,
        total_tokens: 30,
      },
    });
    const byTokens = await openaiTranscriber({
      apiKey,
      fetch: tokens.fetch,
      model: "gpt-4o-transcribe",
    }).transcribe({ audio: Buffer.from("RIFF"), container: "wav", language: "es" });
    expect(byTokens.usage).toEqual({ inputTokens: 20, outputTokens: 10 });

    const duration = fakeFetch(200, { text: "Hola.", usage: { type: "duration", seconds: 3 } });
    const bySeconds = await openaiTranscriber({
      apiKey,
      fetch: duration.fetch,
      model: "gpt-transcribe",
    }).transcribe({ audio: Buffer.from("RIFF"), container: "wav", language: "es" });
    expect(bySeconds.usage).toEqual({ seconds: 3 });
  });

  it("fails with the status and without the provider's body", async () => {
    const { fetch } = fakeFetch(400, { error: { message: "bad key secret-key" } });
    const failure = openaiTranscriber({ apiKey, fetch, model: "gpt-transcribe" }).transcribe({
      audio: Buffer.alloc(1),
      container: "wav",
      language: "en",
    });
    await expect(failure).rejects.toThrow(/^openai-transcribe:gpt-transcribe answered 400$/);
  });
});

const chatCompleted = {
  choices: [{ finish_reason: "stop", message: { content: " Hola, mundo. ", reasoning: "r" } }],
  usage: { prompt_tokens: 90, completion_tokens: 12 },
};

describe("groq-chat refiner", () => {
  it("labels itself with its model", () => {
    expect(groqChatRefiner({ apiKey, model: "openai/gpt-oss-20b" }).label).toBe(
      "groq-chat:openai/gpt-oss-20b",
    );
  });

  it("sends the instructions as system and the transcript as user, and maps text and usage", async () => {
    const { fetch, captured } = fakeFetch(200, chatCompleted);
    const result = await groqChatRefiner({ apiKey, fetch, model: "openai/gpt-oss-120b" }).refine({
      raw: "eh hola mundo",
      language: "es",
      instructions: "clean",
    });
    expect(result).toEqual({ text: "Hola, mundo.", usage: { inputTokens: 90, outputTokens: 12 } });
    const body = JSON.parse(String(captured[0]?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: "clean" },
        { role: "user", content: "eh hola mundo" },
      ],
    });
    expect(captured[0]?.headers.authorization).toBe("Bearer secret-key");
  });

  it("sends reasoning effort and temperature when asked", async () => {
    const { fetch, captured } = fakeFetch(200, chatCompleted);
    await groqChatRefiner({
      apiKey,
      fetch,
      model: "openai/gpt-oss-20b",
      reasoningEffort: "low",
      temperature: 0,
    }).refine({ raw: "x", language: "en", instructions: "i" });
    expect(JSON.parse(String(captured[0]?.body))).toMatchObject({
      reasoning_effort: "low",
      temperature: 0,
    });
  });

  it("fails when the answer was cut instead of returning partial text", async () => {
    const { fetch } = fakeFetch(200, {
      ...chatCompleted,
      choices: [{ finish_reason: "length", message: { content: "Hola" } }],
    });
    const failure = groqChatRefiner({ apiKey, fetch, model: "openai/gpt-oss-20b" }).refine({
      raw: "x",
      language: "es",
      instructions: "i",
    });
    await expect(failure).rejects.toThrow(/finished with length$/);
  });

  it("fails with the status on an error answer", async () => {
    const { fetch } = fakeFetch(429, { error: { message: "rate limited" } });
    const failure = groqChatRefiner({ apiKey, fetch, model: "openai/gpt-oss-20b" }).refine({
      raw: "x",
      language: "es",
      instructions: "i",
    });
    await expect(failure).rejects.toThrow(ProviderError);
    await expect(failure).rejects.toThrow(/answered 429$/);
  });
});

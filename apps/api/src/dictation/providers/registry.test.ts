import {
  refinerIds,
  transcriberIds,
  type RefinerId,
  type TranscriberId,
} from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import type { Fetch } from "./http.ts";
import { refinerOf, transcriberOf } from "./registry.ts";

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(json: unknown): { fetch: Fetch; captured: Captured[] } {
  const captured: Captured[] = [];
  const fetch: Fetch = (input, init) => {
    captured.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body,
    });
    return Promise.resolve(Response.json(json));
  };
  return { fetch, captured };
}

const keys = () =>
  Promise.resolve({
    GROQ_API_KEY: "groq-key",
    OPENAI_API_KEY: "openai-key",
    TOGETHER_API_KEY: "together-key",
    CEREBRAS_API_KEY: "cerebras-key",
  });

async function formEntries(form: FormData): Promise<unknown[]> {
  const entries: unknown[] = [];
  for (const [name, value] of form.entries()) {
    entries.push(
      typeof value === "string"
        ? [name, value]
        : [name, value.name, value.type, Buffer.from(await value.arrayBuffer()).toString("hex")],
    );
  }
  return entries;
}

const audio = ["file", "audio.wav", "audio/wav", "52494646"];

const transcriberRequests: Record<
  TranscriberId,
  { label: string; url: string; key: string; form: unknown[] }
> = {
  "whisper-large-v3-turbo": {
    label: "groq-whisper:whisper-large-v3-turbo",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    key: "groq-key",
    form: [
      audio,
      ["model", "whisper-large-v3-turbo"],
      ["language", "es"],
      ["response_format", "json"],
      ["temperature", "0"],
      ["prompt", "Terraform, Lambda."],
    ],
  },
  "gpt-transcribe": {
    label: "openai-transcribe:gpt-transcribe",
    url: "https://api.openai.com/v1/audio/transcriptions",
    key: "openai-key",
    form: [
      audio,
      ["model", "gpt-transcribe"],
      ["response_format", "json"],
      ["temperature", "0"],
      ["languages[]", "es"],
      ["prompt", "Terraform, Lambda."],
    ],
  },
  "together-parakeet": {
    label: "together-transcribe:nvidia/parakeet-tdt-0.6b-v3",
    url: "https://api.together.ai/v1/audio/transcriptions",
    key: "together-key",
    form: [
      audio,
      ["model", "nvidia/parakeet-tdt-0.6b-v3"],
      ["language", "es"],
      ["response_format", "json"],
      ["temperature", "0"],
    ],
  },
};

const chat = (model: string, effort: string) =>
  `{"model":"${model}","messages":[{"role":"system","content":"clean"},{"role":"user","content":"eh hola"}],"reasoning_effort":"${effort}","temperature":0}`;
const responses = (model: string, effort?: string) =>
  `{"model":"${model}","instructions":"clean","input":"eh hola","store":false${effort === undefined ? "" : `,"reasoning":{"effort":"${effort}"},"temperature":0`}}`;

const refinerRequests: Record<
  RefinerId,
  { label: string; url: string; key: string; body: string; answer: "responses" | "chat" }
> = {
  "gpt-5.4-nano": {
    label: "openai:gpt-5.4-nano",
    url: "https://api.openai.com/v1/responses",
    key: "openai-key",
    body: '{"model":"gpt-5.4-nano","instructions":"clean","input":"eh hola","store":false}',
    answer: "responses",
  },
  "gpt-5.4-nano@none": {
    label: "openai:gpt-5.4-nano@none",
    url: "https://api.openai.com/v1/responses",
    key: "openai-key",
    body: responses("gpt-5.4-nano", "none"),
    answer: "responses",
  },
  "gpt-5.6-luna@none": {
    label: "openai:gpt-5.6-luna@none",
    url: "https://api.openai.com/v1/responses",
    key: "openai-key",
    body: responses("gpt-5.6-luna", "none"),
    answer: "responses",
  },
  "cerebras-qwen-3.8-27b@none": {
    label: "cerebras-chat:qwen-3.8-27b@none",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: "cerebras-key",
    body: chat("qwen-3.8-27b", "none"),
    answer: "chat",
  },
  "cerebras-gpt-oss-120b@low": {
    label: "cerebras-chat:gpt-oss-120b@low",
    url: "https://api.cerebras.ai/v1/chat/completions",
    key: "cerebras-key",
    body: chat("gpt-oss-120b", "low"),
    answer: "chat",
  },
  "gpt-oss-20b@low": {
    label: "groq-chat:openai/gpt-oss-20b@low",
    url: "https://api.groq.com/openai/v1/chat/completions",
    key: "groq-key",
    body: chat("openai/gpt-oss-20b", "low"),
    answer: "chat",
  },
};

const answers = {
  responses: {
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: "Hola." }] }],
    usage: { input_tokens: 10, output_tokens: 2 },
  },
  chat: {
    choices: [{ finish_reason: "stop", message: { content: "Hola." } }],
    usage: { prompt_tokens: 10, completion_tokens: 2 },
  },
};

describe("production registry", () => {
  it.each(transcriberIds)("%s sends its pinned URL, key and form fields", async (id) => {
    const expected = transcriberRequests[id];
    const { fetch, captured } = fakeFetch({ text: " Hola. " });
    const transcriber = transcriberOf(id, keys, { fetch });
    expect(transcriber.label).toBe(expected.label);
    const transcript = await transcriber.transcribe({
      audio: Buffer.from("RIFF"),
      container: "wav",
      language: "es",
      prompt: "Terraform, Lambda.",
    });
    expect(transcript.text).toBe("Hola.");
    expect(captured[0]?.url).toBe(expected.url);
    expect(captured[0]?.headers).toEqual({ authorization: `Bearer ${expected.key}` });
    expect(await formEntries(captured[0]?.body as FormData)).toEqual(expected.form);
  });

  it.each(refinerIds)("%s sends its pinned URL, key and body", async (id) => {
    const expected = refinerRequests[id];
    const { fetch, captured } = fakeFetch(answers[expected.answer]);
    const refiner = refinerOf(id, keys, { fetch });
    expect(refiner.label).toBe(expected.label);
    const refined = await refiner.refine({ raw: "eh hola", language: "es", instructions: "clean" });
    expect(refined).toEqual({ text: "Hola.", usage: { inputTokens: 10, outputTokens: 2 } });
    expect(captured[0]?.url).toBe(expected.url);
    expect(captured[0]?.headers).toEqual({
      authorization: `Bearer ${expected.key}`,
      "content-type": "application/json",
    });
    expect(captured[0]?.body).toBe(expected.body);
  });

  it("fails a call whose provider key is missing, naming the key and calling nothing", async () => {
    const { fetch, captured } = fakeFetch(answers.chat);
    const refiner = refinerOf("cerebras-qwen-3.8-27b@none", () => Promise.resolve({}), { fetch });
    await expect(refiner.refine({ raw: "x", language: "en", instructions: "i" })).rejects.toThrow(
      "The providers secret has no value for CEREBRAS_API_KEY.",
    );
    expect(captured).toEqual([]);
  });
});

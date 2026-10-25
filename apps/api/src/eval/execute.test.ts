import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import type { RefinerId } from "@take-my-word/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pcmToWav } from "../../e2e/speech.ts";
import type { ProviderRequest } from "./contract.ts";
import { execute, type ExecuteDeps } from "./execute.ts";
import { dispatcherFor, probedFetch, urlOf } from "./http-probe.ts";

interface Seen {
  path: string;
  contentType: string;
  fields?: Record<string, string>;
  json?: Record<string, unknown>;
}

function multipartFields(body: string): Record<string, string> {
  return Object.fromEntries(
    [
      ...body.matchAll(
        /name="([^"]+)"(?:; filename="[^"]*")?\r\n(?:Content-Type: [^\r]*\r\n)?\r\n([^\r]*)/g,
      ),
    ].map(([, name, value]) => [name ?? "", value ?? ""]),
  );
}

const seen: Seen[] = [];
let server: Server;
let origin = "";

function answer(seenRequest: Seen): {
  status: number;
  body: unknown;
  headers: Record<string, string>;
} {
  const limits = {
    "x-ratelimit-remaining-requests": "1999",
    "x-groq-region": "us-east-1",
    "x-request-id": "not kept",
  };
  if (seenRequest.path.endsWith("/audio/transcriptions")) {
    const language = seenRequest.fields?.language ?? seenRequest.fields?.["languages[]"];
    if (language === "auto")
      return {
        status: 200,
        body: { text: " hola ", language: "spanish", duration: 1 },
        headers: {},
      };
    if (language === undefined)
      return { status: 200, body: { text: "bonjour", language: "french" }, headers: limits };
    return {
      status: 200,
      body: { text: ` in ${language} `, usage: { type: "duration", seconds: 3 } },
      headers: limits,
    };
  }
  if (seenRequest.json?.model === "gpt-oss-120b") {
    return {
      status: 429,
      body: { error: { message: "slow down" } },
      headers: { ...limits, "retry-after": "7" },
    };
  }
  return {
    status: 200,
    body: {
      choices: [{ finish_reason: "stop", message: { content: "Clean text." } }],
      usage: { prompt_tokens: 40, completion_tokens: 3 },
    },
    headers: limits,
  };
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      const contentType = request.headers["content-type"] ?? "";
      const entry: Seen = { path: request.url ?? "", contentType };
      if (contentType.startsWith("multipart/form-data")) {
        entry.fields = multipartFields(body.toString("utf8"));
      } else {
        entry.json = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
      }
      seen.push(entry);
      const { status, body: json, headers } = answer(entry);
      response.writeHead(status, { "content-type": "application/json", ...headers });
      response.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const deps: ExecuteDeps = {
  keys: () =>
    Promise.resolve({
      GROQ_API_KEY: "groq-key",
      OPENAI_API_KEY: "openai-key",
      TOGETHER_API_KEY: "together-key",
      CEREBRAS_API_KEY: "cerebras-key",
    }),
  dispatcherFor,
  probedFetch: (dispatcher, records) => {
    const fetch = probedFetch(dispatcher, () => performance.now(), records);
    return (input, init) => fetch(`${origin}${new URL(urlOf(input)).pathname}`, init);
  },
  elapsed: () => performance.now(),
};

const transcribe = (connection: "fresh" | "reused"): ProviderRequest => ({
  kind: "transcribe",
  connection,
  transcriber: "whisper-large-v3-turbo",
  audioBase64: Buffer.from("RIFF-bytes").toString("base64"),
  container: "wav",
  languages: ["es", "en"],
  prompt: "kubectl, Terraform",
});

const refine = (
  refiner: RefinerId = "gpt-oss-20b@low",
  connection: "fresh" | "reused" = "fresh",
): ProviderRequest => ({
  kind: "refine",
  connection,
  refiner,
  raw: "eh clean text",
  language: "en",
  instructions: "clean it",
});

describe("execute", () => {
  it("wraps the transcriber in the production language choice and measures every call", async () => {
    seen.length = 0;
    const result = await execute(transcribe("fresh"), deps);
    expect(result).toMatchObject({
      ok: true,
      label: "groq-whisper:whisper-large-v3-turbo",
      text: "in es",
      language: "es",
    });
    expect(result.calls.map((call) => call.requested)).toEqual([undefined, "es"]);
    expect(result.calls[0]).toMatchObject({
      status: 200,
      headers: { "x-ratelimit-remaining-requests": "1999", "x-groq-region": "us-east-1" },
    });
    expect(result.calls[0]?.headers).not.toHaveProperty("x-request-id");
    expect(result.calls[0]?.ms).toBeGreaterThanOrEqual(result.calls[0]?.headersMs ?? Infinity);
    expect(seen[1]?.fields).toMatchObject({
      prompt: "kubectl, Terraform",
      language: "es",
      file: "RIFF-bytes",
    });
    expect(seen[1]?.contentType).toMatch(/^multipart\/form-data; boundary=/);
  });

  it("returns the usage each transcriber call was billed by", async () => {
    const result = await execute(
      {
        ...transcribe("fresh"),
        transcriber: "gpt-transcribe",
        languages: ["en"],
      } as ProviderRequest,
      deps,
    );
    expect(result.calls).toEqual([
      expect.objectContaining({ requested: "en", usage: { seconds: 3 } }),
    ]);
  });

  it("opens a new connection for every fresh call and keeps one for reused calls", async () => {
    const fresh = await execute(refine(), deps);
    const freshAgain = await execute(refine(), deps);
    expect(fresh.calls[0]?.newConnections).toBe(1);
    expect(freshAgain.calls[0]?.newConnections).toBe(1);

    await execute(refine("gpt-oss-20b@low", "reused"), deps);
    await sleep(20);
    const reused = await execute(refine("gpt-oss-20b@low", "reused"), deps);
    expect(reused.calls[0]?.newConnections).toBe(0);
  });

  it("returns text and token usage of a refiner with its tuning applied", async () => {
    seen.length = 0;
    const result = await execute(refine(), deps);
    expect(result).toMatchObject({
      ok: true,
      label: "groq-chat:openai/gpt-oss-20b@low",
      text: "Clean text.",
      usage: { inputTokens: 40, outputTokens: 3 },
    });
    expect(seen[0]?.json).toMatchObject({ reasoning_effort: "low", temperature: 0 });
  });

  it("reports a provider failure with its status and rate-limit headers instead of throwing", async () => {
    const result = await execute(refine("cerebras-gpt-oss-120b@low"), deps);
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      status: 429,
      message: "cerebras-chat:gpt-oss-120b@low answered 429",
    });
    expect(result.calls[0]).toMatchObject({
      status: 429,
      error: "cerebras-chat:gpt-oss-120b@low answered 429",
      headers: { "retry-after": "7" },
    });
  });
});

function tone(seconds: number): Buffer {
  const samples = new Int16Array(16_000 * seconds).map((_, index) =>
    Math.round(Math.sin((index / 16_000) * 2 * Math.PI * 220) * 6_000),
  );
  return pcmToWav(Buffer.from(samples.buffer));
}

const dictateRequest = (refiner: RefinerId): ProviderRequest => ({
  kind: "dictate",
  connection: "fresh",
  transcriber: "together-parakeet",
  refiner,
  audioBase64: tone(1).toString("base64"),
  container: "wav",
  languages: ["es", "en"],
  terms: [{ term: "Terraform", aliases: ["terra form"] }],
  termsUsedAt: "2026-10-24T00:00:00.000Z",
});

describe("execute dictate", () => {
  it("runs production's pipeline with the candidate adapters and measures each stage", async () => {
    seen.length = 0;
    const result = await execute(dictateRequest("cerebras-qwen-3.8-27b@none"), deps);
    expect(result).toMatchObject({
      ok: true,
      label: "together-transcribe:nvidia/parakeet-tdt-0.6b-v3 + cerebras-chat:qwen-3.8-27b@none",
      text: "Clean text.",
      dictation: {
        raw: "hola",
        text: "Clean text.",
        providers: {
          transcriber: "together-transcribe:nvidia/parakeet-tdt-0.6b-v3",
          refiner: "cerebras-chat:qwen-3.8-27b@none",
        },
      },
    });
    expect(result.calls.map((call) => call.stage)).toEqual(["transcribe", "refine"]);
    expect(result.calls[0]?.usage).toEqual({ seconds: 1 });
    expect(result.calls[1]?.usage).toEqual({ inputTokens: 40, outputTokens: 3 });
    expect(seen[0]?.fields).toMatchObject({ language: "auto", response_format: "verbose_json" });
    expect(seen[0]?.fields).not.toHaveProperty("prompt");
    const messages = seen[1]?.json?.messages as { role: string; content: string }[];
    expect(messages[0]?.content).toContain("Terraform");
    expect(messages[1]).toEqual({ role: "user", content: "hola" });
    const latency = result.dictation?.latencyMs;
    expect(latency?.total).toBeGreaterThanOrEqual(
      (latency?.transcribe ?? 0) + (latency?.refine ?? 0),
    );
  });

  it("reports the failing provider's status instead of the API error", async () => {
    const result = await execute(dictateRequest("cerebras-gpt-oss-120b@low"), deps);
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      status: 429,
      message: "cerebras-chat:gpt-oss-120b@low answered 429",
    });
    expect(result.calls.map((call) => call.stage)).toEqual(["transcribe", "refine"]);
  });
});

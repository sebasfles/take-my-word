import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    const language = seenRequest.fields?.language;
    if (language === undefined)
      return { status: 200, body: { text: "bonjour", language: "french" }, headers: limits };
    return { status: 200, body: { text: ` in ${language} ` }, headers: limits };
  }
  if (seenRequest.json?.model === "limited") {
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
  keys: () => Promise.resolve({ GROQ_API_KEY: "groq-key", OPENAI_API_KEY: "openai-key" }),
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
  transcriber: { provider: "groq-whisper", model: "whisper-large-v3" },
  audioBase64: Buffer.from("RIFF-bytes").toString("base64"),
  container: "wav",
  languages: ["es", "en"],
  prompt: "kubectl, Terraform",
});

const refine = (model: string, connection: "fresh" | "reused" = "fresh"): ProviderRequest => ({
  kind: "refine",
  connection,
  refiner: { provider: "groq-chat", model, reasoningEffort: "low", temperature: 0 },
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
      label: "groq-whisper:whisper-large-v3",
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

  it("opens a new connection for every fresh call and keeps one for reused calls", async () => {
    const fresh = await execute(refine("model"), deps);
    const freshAgain = await execute(refine("model"), deps);
    expect(fresh.calls[0]?.newConnections).toBe(1);
    expect(freshAgain.calls[0]?.newConnections).toBe(1);

    await execute(refine("model", "reused"), deps);
    await sleep(20);
    const reused = await execute(refine("model", "reused"), deps);
    expect(reused.calls[0]?.newConnections).toBe(0);
  });

  it("returns text and token usage of a refiner with its tuning applied", async () => {
    seen.length = 0;
    const result = await execute(refine("openai/gpt-oss-20b"), deps);
    expect(result).toMatchObject({
      ok: true,
      label: "groq-chat:openai/gpt-oss-20b",
      text: "Clean text.",
      usage: { inputTokens: 40, outputTokens: 3 },
    });
    expect(seen[0]?.json).toMatchObject({ reasoning_effort: "low", temperature: 0 });
  });

  it("reports a provider failure with its status and rate-limit headers instead of throwing", async () => {
    const result = await execute(refine("limited"), deps);
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ status: 429, message: "groq-chat:limited answered 429" });
    expect(result.calls[0]).toMatchObject({
      status: 429,
      error: "groq-chat:limited answered 429",
      headers: { "retry-after": "7" },
    });
  });
});

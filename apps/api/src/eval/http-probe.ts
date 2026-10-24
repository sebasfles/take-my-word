import { subscribe } from "node:diagnostics_channel";
import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciInit,
} from "undici";
import type { Fetch } from "../dictation/providers/http.ts";
import type { Connection } from "./contract.ts";

let connected = 0;
subscribe("undici:client:connected", () => {
  connected += 1;
});

const keptAlive = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000 });

export function dispatcherFor(connection: Connection): {
  dispatcher: Dispatcher;
  release: () => Promise<void>;
} {
  if (connection === "reused") return { dispatcher: keptAlive, release: () => Promise.resolve() };
  const fresh = new Agent();
  return { dispatcher: fresh, release: () => fresh.close() };
}

export interface HttpRecord {
  headersMs: number;
  status?: number;
  newConnections: number;
  headers: Record<string, string>;
}

const keptHeaders = /^(x-ratelimit-|retry-after$|x-groq-region$|openai-processing-ms$)/;

export function pickHeaders(headers: Headers): Record<string, string> {
  const picked: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (keptHeaders.test(name)) picked[name] = value;
  });
  return picked;
}

export function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

export function probedFetch(
  dispatcher: Dispatcher,
  elapsed: () => number,
  records: HttpRecord[],
): Fetch {
  return async (input, init) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name] = value;
    });
    let body = init?.body ?? undefined;
    if (body instanceof FormData) {
      const encoded = new Response(body);
      headers["content-type"] = encoded.headers.get("content-type") ?? "";
      body = new Uint8Array(await encoded.arrayBuffer());
    }
    const before = connected;
    const start = elapsed();
    try {
      const response = await undiciFetch(urlOf(input), {
        method: init?.method ?? "GET",
        headers,
        ...(body !== undefined && { body: body as NonNullable<UndiciInit["body"]> }),
        ...(init?.signal && { signal: init.signal }),
        dispatcher,
      });
      records.push({
        headersMs: elapsed() - start,
        status: response.status,
        newConnections: connected - before,
        headers: pickHeaders(response.headers),
      });
      return response;
    } catch (error) {
      records.push({
        headersMs: elapsed() - start,
        newConnections: connected - before,
        headers: {},
      });
      throw error;
    }
  };
}

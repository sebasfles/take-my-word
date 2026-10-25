import type { HistoryItem } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import { accountApi } from "./api.ts";

const apiUrl = "https://api.dictation.example.com";

const settings = {
  defaultStyleId: "formal",
  locale: "es",
  dictationLanguages: ["es"],
  context: { picks: ["law"], detail: "contratos" },
};

interface Seen {
  method: string;
  url: URL;
  authorization: string | null;
}

function fakeFetch(answer: (url: URL, method: string) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    seen.push({ method, url, authorization: new Headers(init?.headers).get("authorization") });
    return answer(url, method);
  };
  return { fetcher, seen };
}

function item(index: number): HistoryItem {
  return {
    id: `id-${String(index)}`,
    createdAt: new Date(Date.UTC(2026, 9, 21) - index * 60_000).toISOString(),
    locale: "es",
    text: `texto ${String(index)}`,
    raw: `crudo ${String(index)}`,
    styleId: "plain",
    audioSeconds: 2.5,
  };
}

function historyServer(total: number) {
  const all = Array.from({ length: total }, (_, index) => item(index));
  return fakeFetch((url) => {
    const limit = Number(url.searchParams.get("limit"));
    const start = Number(url.searchParams.get("cursor") ?? "0");
    const items = all.slice(start, start + limit);
    const end = start + items.length;
    return Response.json({
      items,
      ...(items.length === limit && { cursor: String(end) }),
    });
  });
}

describe("accountApi reads", () => {
  it("calls the API with the access token and parses the shared contracts", async () => {
    const term = {
      id: "dA",
      term: "Kubernetes",
      aliases: ["kubernetis"],
      useCount: 3,
      lastUsedAt: "2026-10-20T10:00:00.000Z",
      createdAt: "2026-10-01T10:00:00.000Z",
    };
    const style = { id: "s1", name: "Slack", prompt: "Corto", builtin: false };
    const rule = { id: "rA", appId: "slack.exe", styleId: "s1", keystroke: "ctrl+v" };
    const { fetcher, seen } = fakeFetch((url) => {
      const bodies: Record<string, unknown> = {
        "/me/settings": settings,
        "/dictionary": { terms: [term] },
        "/styles": { styles: [style] },
        "/app-rules": { rules: [rule] },
      };
      return Response.json(bodies[url.pathname]);
    });
    const api = accountApi(apiUrl, "token", fetcher);
    expect(await api.settings()).toEqual({ kind: "ok", value: settings });
    expect(await api.dictionary()).toEqual({ kind: "ok", value: [term] });
    expect(await api.styles()).toEqual({ kind: "ok", value: [style] });
    expect(await api.appRules()).toEqual({ kind: "ok", value: [rule] });
    expect(seen.map((call) => [call.method, call.url.href, call.authorization])).toEqual([
      ["GET", `${apiUrl}/me/settings`, "Bearer token"],
      ["GET", `${apiUrl}/dictionary`, "Bearer token"],
      ["GET", `${apiUrl}/styles`, "Bearer token"],
      ["GET", `${apiUrl}/app-rules`, "Bearer token"],
    ]);
  });

  it("fails on an error status, a body outside the contract or a network error", async () => {
    const answers = [
      () => Response.json({ error: { code: "unauthorized", message: "" } }, { status: 401 }),
      () => Response.json({ defaultStyleId: 3 }),
      () => Promise.reject(new TypeError("fetch failed")),
    ];
    for (const answer of answers) {
      const { fetcher } = fakeFetch(answer);
      expect(await accountApi(apiUrl, "token", fetcher).settings()).toEqual({ kind: "failed" });
    }
  });
});

describe("accountApi.usage", () => {
  it("reads today's usage, and nothing from a server without the route", async () => {
    const usage = { usedSeconds: 61.5, capSeconds: 3600, resetsAt: "2026-10-24T00:00:00.000Z" };
    const present = fakeFetch(() => Response.json(usage));
    expect(await accountApi(apiUrl, "token", present.fetcher).usage()).toEqual({
      kind: "ok",
      value: usage,
    });
    expect(present.seen[0]?.url.href).toBe(`${apiUrl}/me/usage`);
    const absent = fakeFetch(() =>
      Response.json({ error: { code: "not_found", message: "No such route." } }, { status: 404 }),
    );
    expect(await accountApi(apiUrl, "token", absent.fetcher).usage()).toEqual({
      kind: "ok",
      value: null,
    });
    const broken = fakeFetch(() => new Response("", { status: 500 }));
    expect(await accountApi(apiUrl, "token", broken.fetcher).usage()).toEqual({ kind: "failed" });
  });
});

describe("accountApi.history", () => {
  it("asks for one item more than it shows, to know whether another page exists", async () => {
    const { fetcher, seen } = historyServer(5);
    const result = await accountApi(apiUrl, "token", fetcher).history(2);
    expect(result).toEqual({ kind: "ok", value: { items: [item(0), item(1)], more: true } });
    expect(seen.map((call) => call.url.search)).toEqual(["?limit=3"]);
  });

  it("reports no more pages when everything fits, even if the API still sent a cursor", async () => {
    const { fetcher } = historyServer(2);
    expect(await accountApi(apiUrl, "token", fetcher).history(2)).toEqual({
      kind: "ok",
      value: { items: [item(0), item(1)], more: false },
    });
  });

  it("follows the cursor in pages of at most 100 until it has what it shows", async () => {
    const { fetcher, seen } = historyServer(250);
    const result = await accountApi(apiUrl, "token", fetcher).history(220);
    expect(result.kind === "ok" && result.value.items.length).toBe(220);
    expect(result.kind === "ok" && result.value.items.at(-1)).toEqual(item(219));
    expect(result.kind === "ok" && result.value.more).toBe(true);
    expect(seen.map((call) => call.url.search)).toEqual([
      "?limit=100",
      "?limit=100&cursor=100",
      "?limit=21&cursor=200",
    ]);
  });

  it("never asks for more than 1000 items, so the requests per render stay bounded", async () => {
    const { fetcher, seen } = historyServer(2000);
    const result = await accountApi(apiUrl, "token", fetcher).history(5000);
    expect(result.kind === "ok" && result.value.items.length).toBe(1000);
    expect(seen).toHaveLength(11);
  });

  it("fails when any page fails", async () => {
    const { fetcher } = fakeFetch((url) =>
      url.searchParams.has("cursor")
        ? new Response(null, { status: 500 })
        : Response.json({ items: [item(0)], cursor: "1" }),
    );
    expect(await accountApi(apiUrl, "token", fetcher).history(5)).toEqual({ kind: "failed" });
  });
});

describe("accountApi.deleteDictation", () => {
  it("sends DELETE /dictations/{id} with the token", async () => {
    const { fetcher, seen } = fakeFetch(() => new Response(null, { status: 204 }));
    expect(await accountApi(apiUrl, "token", fetcher).deleteDictation("MjAyNi0x")).toBe("deleted");
    expect(seen.map((call) => [call.method, call.url.href, call.authorization])).toEqual([
      ["DELETE", `${apiUrl}/dictations/MjAyNi0x`, "Bearer token"],
    ]);
  });

  it("maps 404, 401, 403, other errors and network errors", async () => {
    const cases: [() => Response | Promise<Response>, string][] = [
      [() => new Response(null, { status: 404 }), "not-found"],
      [() => new Response(null, { status: 401 }), "unauthorized"],
      [() => new Response(null, { status: 403 }), "unauthorized"],
      [() => new Response(null, { status: 500 }), "failed"],
      [() => Promise.reject(new TypeError("fetch failed")), "failed"],
    ];
    for (const [answer, outcome] of cases) {
      const { fetcher } = fakeFetch(answer);
      expect(await accountApi(apiUrl, "token", fetcher).deleteDictation("eA")).toBe(outcome);
    }
  });
});

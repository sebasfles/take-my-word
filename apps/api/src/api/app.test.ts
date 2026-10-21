import {
  apiErrorSchema,
  appRuleListSchema,
  appRuleSchema,
  dictionaryListSchema,
  dictionaryTermSchema,
  historyPageSchema,
  settingsSchema,
  styleListSchema,
  styleSchema,
} from "@take-my-word/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../lib/log.ts";
import { memoryStores } from "../testing/memory-stores.ts";
import { createApi } from "./app.ts";

class World {
  stores = memoryStores();
  ids = 0;
  now = new Date("2026-10-21T10:00:00.000Z");
  lines: string[] = [];
  app = createApi({
    ...this.stores,
    newId: () => `custom-${String((this.ids += 1))}`,
    now: () => this.now,
    log: createLogger({}, (line) => this.lines.push(line)),
  });

  async call(
    method: string,
    path: string,
    { user = "user-a", body }: { user?: string | null; body?: unknown } = {},
  ) {
    const response = await this.app.request(
      path,
      {
        method,
        ...(body !== undefined && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      },
      user === null
        ? {}
        : { event: { requestContext: { authorizer: { lambda: { userId: user } } } } },
    );
    const text = await response.text();
    return {
      status: response.status,
      json: text === "" ? undefined : (JSON.parse(text) as unknown),
    };
  }

  seedDictation(user: string, createdAt: string, requestId: string) {
    this.stores.seedDictation(
      user,
      {
        sk: `DICTATION#${createdAt}#${requestId}`,
        createdAt,
        locale: "es",
        text: `texto ${requestId}`,
        raw: `crudo ${requestId}`,
        styleId: "plain",
        audioSeconds: 3,
      },
      Date.parse(createdAt) / 1000 + 90 * 86_400,
    );
  }
}

let world: World;
beforeEach(() => {
  world = new World();
});

const code = (json: unknown) => apiErrorSchema.parse(json).error.code;

describe("authorization", () => {
  it.each([
    ["GET", "/dictionary"],
    ["POST", "/dictionary"],
    ["PUT", "/dictionary/x"],
    ["DELETE", "/dictionary/x"],
    ["GET", "/styles"],
    ["POST", "/styles"],
    ["PUT", "/styles/x"],
    ["DELETE", "/styles/x"],
    ["GET", "/app-rules"],
    ["POST", "/app-rules"],
    ["PUT", "/app-rules/x"],
    ["DELETE", "/app-rules/x"],
    ["GET", "/me/settings"],
    ["PUT", "/me/settings"],
    ["GET", "/dictations"],
    ["DELETE", "/dictations/x"],
  ])("%s %s answers 401 without the authorizer's user", async (method, path) => {
    const body = method === "GET" ? undefined : {};
    const { status, json } = await world.call(method, path, { user: null, body });
    expect(status).toBe(401);
    expect(code(json)).toBe("unauthorized");
  });

  it("keeps every item of user A invisible and untouchable for user B", async () => {
    const termId = dictionaryTermSchema.parse(
      (await world.call("POST", "/dictionary", { body: { term: "Kubernetes" } })).json,
    ).id;
    const style = styleSchema.parse(
      (await world.call("POST", "/styles", { body: { name: "Mine", prompt: "Short." } })).json,
    );
    const ruleId = appRuleSchema.parse(
      (
        await world.call("POST", "/app-rules", {
          body: { appId: "notepad.exe", keystroke: "ctrl+v" },
        })
      ).json,
    ).id;
    await world.call("PUT", "/me/settings", {
      body: {
        defaultStyleId: style.id,
        locale: "en",
        providers: { transcriber: "groq-whisper", refiner: "openai" },
      },
    });
    world.seedDictation("user-a", "2026-10-21T09:00:00.000Z", "r1");
    const asA = historyPageSchema.parse((await world.call("GET", "/dictations")).json);
    const dictationId = asA.items[0]?.id ?? "";

    const b = { user: "user-b" };
    expect(
      dictionaryListSchema.parse((await world.call("GET", "/dictionary", b)).json).terms,
    ).toEqual([]);
    const stylesOfB = styleListSchema.parse((await world.call("GET", "/styles", b)).json).styles;
    expect(stylesOfB.map((entry) => entry.id)).toEqual(["plain", "casual", "formal"]);
    expect(appRuleListSchema.parse((await world.call("GET", "/app-rules", b)).json).rules).toEqual(
      [],
    );
    expect(
      settingsSchema.parse((await world.call("GET", "/me/settings", b)).json).defaultStyleId,
    ).toBe("plain");
    expect(historyPageSchema.parse((await world.call("GET", "/dictations", b)).json).items).toEqual(
      [],
    );

    expect(
      (await world.call("PUT", `/dictionary/${termId}`, { ...b, body: { aliases: [] } })).status,
    ).toBe(404);
    expect((await world.call("DELETE", `/dictionary/${termId}`, b)).status).toBe(404);
    expect(
      (await world.call("PUT", `/styles/${style.id}`, { ...b, body: { name: "x", prompt: "y" } }))
        .status,
    ).toBe(404);
    expect((await world.call("DELETE", `/styles/${style.id}`, b)).status).toBe(404);
    expect(
      (await world.call("PUT", `/app-rules/${ruleId}`, { ...b, body: { keystroke: "cmd+v" } }))
        .status,
    ).toBe(404);
    expect((await world.call("DELETE", `/app-rules/${ruleId}`, b)).status).toBe(404);
    expect((await world.call("DELETE", `/dictations/${dictationId}`, b)).status).toBe(404);
    const ruleForB = await world.call("POST", "/app-rules", {
      ...b,
      body: { appId: "code.exe", styleId: style.id, keystroke: "ctrl+v" },
    });
    expect(ruleForB.status).toBe(400);

    expect(
      dictionaryListSchema.parse((await world.call("GET", "/dictionary")).json).terms,
    ).toHaveLength(1);
    expect(
      historyPageSchema.parse((await world.call("GET", "/dictations")).json).items,
    ).toHaveLength(1);
  });
});

describe("dictionary", () => {
  it("adds a term seeded at one use today, lists it and refuses the same term in any case or accent", async () => {
    const created = await world.call("POST", "/dictionary", {
      body: { term: "  Kubernetes ", aliases: ["cubernetes", "Cubernetes", "kubernetes"] },
    });
    expect(created.status).toBe(201);
    expect(dictionaryTermSchema.parse(created.json)).toEqual({
      id: expect.any(String) as string,
      term: "Kubernetes",
      aliases: ["cubernetes"],
      useCount: 1,
      lastUsedAt: "2026-10-21T10:00:00.000Z",
      createdAt: "2026-10-21T10:00:00.000Z",
    });
    for (const term of ["kubernetes", "KUBERNETES", "Kubérnetes", "kubernetes  "]) {
      const again = await world.call("POST", "/dictionary", { body: { term } });
      expect(again.status).toBe(409);
      expect(code(again.json)).toBe("conflict");
    }
    const { terms } = dictionaryListSchema.parse((await world.call("GET", "/dictionary")).json);
    expect(terms.map((term) => term.term)).toEqual(["Kubernetes"]);
  });

  it("edits aliases and deletes a term by its id", async () => {
    const { id } = dictionaryTermSchema.parse(
      (await world.call("POST", "/dictionary", { body: { term: "Groq" } })).json,
    );
    const edited = await world.call("PUT", `/dictionary/${id}`, {
      body: { aliases: ["grok", "grock"] },
    });
    expect(edited.status).toBe(200);
    expect(dictionaryTermSchema.parse(edited.json)).toMatchObject({
      term: "Groq",
      aliases: ["grok", "grock"],
    });
    expect(dictionaryTermSchema.parse(edited.json).id).toBe(id);
    expect((await world.call("DELETE", `/dictionary/${id}`)).status).toBe(204);
    expect((await world.call("DELETE", `/dictionary/${id}`)).status).toBe(404);
  });

  it("answers 400 for a malformed id and 404 for an unknown one", async () => {
    const unfolded = Buffer.from("Groq").toString("base64url");
    for (const id of ["not*base64", `${unfolded}=`, unfolded]) {
      expect((await world.call("DELETE", `/dictionary/${id}`)).status).toBe(400);
    }
    const unknown = Buffer.from("groq").toString("base64url");
    expect((await world.call("DELETE", `/dictionary/${unknown}`)).status).toBe(404);
  });

  it.each(["Visual Studio", "Ñandú Café", "CI/CD", "C#", "100%", "Año / #1 al 100%", "a+b?c"])(
    "round-trips %j through its id in PUT and DELETE",
    async (term) => {
      const created = await world.call("POST", "/dictionary", { body: { term } });
      const { id } = dictionaryTermSchema.parse(created.json);
      expect(id).toMatch(/^[\w-]+$/);
      const path = `/dictionary/${id}`;
      const edited = await world.call("PUT", path, { body: { aliases: ["alias"] } });
      expect(edited.status).toBe(200);
      expect(dictionaryTermSchema.parse(edited.json).term).toBe(term);
      expect((await world.call("DELETE", path)).status).toBe(204);
      expect(
        dictionaryListSchema.parse((await world.call("GET", "/dictionary")).json).terms,
      ).toEqual([]);
    },
  );

  it("answers 400 over the limits", async () => {
    const longTerm = await world.call("POST", "/dictionary", { body: { term: "x".repeat(65) } });
    expect(longTerm.status).toBe(400);
    const manyAliases = Array.from({ length: 11 }, (_, index) => `alias ${String(index)}`);
    expect(
      (await world.call("POST", "/dictionary", { body: { term: "t", aliases: manyAliases } }))
        .status,
    ).toBe(400);
    for (let index = 0; index < 500; index += 1) {
      await world.stores.dictionary.add("user-a", {
        key: `term ${String(index)}`,
        term: `term ${String(index)}`,
        aliases: [],
        useCount: 1,
        lastUsedAt: "2026-10-21T10:00:00.000Z",
        createdAt: "2026-10-21T10:00:00.000Z",
      });
    }
    expect((await world.call("POST", "/dictionary", { body: { term: "one more" } })).status).toBe(
      400,
    );
  });

  it("answers 400 for a body that is not JSON", async () => {
    const response = await world.app.request(
      "/dictionary",
      { method: "POST", body: "{", headers: { "content-type": "application/json" } },
      { event: { requestContext: { authorizer: { lambda: { userId: "user-a" } } } } },
    );
    expect(response.status).toBe(400);
  });
});

describe("styles", () => {
  it("lists the built-ins first and refuses to change them", async () => {
    const { styles } = styleListSchema.parse((await world.call("GET", "/styles")).json);
    expect(styles.map(({ id, builtin }) => [id, builtin])).toEqual([
      ["plain", true],
      ["casual", true],
      ["formal", true],
    ]);
    for (const id of ["plain", "casual", "formal"]) {
      const put = await world.call("PUT", `/styles/${id}`, { body: { name: "x", prompt: "y" } });
      expect(put.status).toBe(403);
      expect(code(put.json)).toBe("forbidden");
      expect((await world.call("DELETE", `/styles/${id}`)).status).toBe(403);
    }
  });

  it("creates, edits and deletes a custom style, up to 20", async () => {
    const created = await world.call("POST", "/styles", {
      body: { name: "Slack", prompt: "Short and direct." },
    });
    expect(created.status).toBe(201);
    const style = styleSchema.parse(created.json);
    expect(style).toMatchObject({ name: "Slack", prompt: "Short and direct.", builtin: false });
    const edited = await world.call("PUT", `/styles/${style.id}`, {
      body: { name: "Slack", prompt: "Shorter." },
    });
    expect(styleSchema.parse(edited.json).prompt).toBe("Shorter.");
    expect((await world.call("DELETE", `/styles/${style.id}`)).status).toBe(204);
    expect((await world.call("DELETE", `/styles/${style.id}`)).status).toBe(404);

    for (let index = 0; index < 20; index += 1) {
      await world.call("POST", "/styles", { body: { name: `s${String(index)}`, prompt: "p" } });
    }
    expect(
      (await world.call("POST", "/styles", { body: { name: "s21", prompt: "p" } })).status,
    ).toBe(400);
    expect(
      (await world.call("POST", "/styles", { body: { name: "x".repeat(41), prompt: "p" } })).status,
    ).toBe(400);
  });

  it("releases app rules and the default style that pointed to a deleted style", async () => {
    const style = styleSchema.parse(
      (await world.call("POST", "/styles", { body: { name: "Mine", prompt: "p" } })).json,
    );
    await world.call("POST", "/app-rules", {
      body: { appId: "notepad.exe", styleId: style.id, keystroke: "ctrl+v" },
    });
    await world.call("POST", "/app-rules", {
      body: { appId: "slack.exe", styleId: "casual", keystroke: "ctrl+v" },
    });
    await world.call("PUT", "/me/settings", {
      body: {
        defaultStyleId: style.id,
        locale: "es",
        providers: { transcriber: "groq-whisper", refiner: "openai" },
      },
    });

    expect((await world.call("DELETE", `/styles/${style.id}`)).status).toBe(204);

    const { rules } = appRuleListSchema.parse((await world.call("GET", "/app-rules")).json);
    expect(rules).toEqual([
      expect.objectContaining({ appId: "notepad.exe", keystroke: "ctrl+v" }),
      expect.objectContaining({ appId: "slack.exe", styleId: "casual" }),
    ]);
    expect(rules[0]).not.toHaveProperty("styleId");
    expect(
      settingsSchema.parse((await world.call("GET", "/me/settings")).json).defaultStyleId,
    ).toBe("plain");
  });
});

describe("app rules", () => {
  it("stores the app id lowercased and edits and deletes the rule by its id", async () => {
    const created = await world.call("POST", "/app-rules", {
      body: { appId: "Notepad.EXE", styleId: "formal", keystroke: "ctrl+v" },
    });
    expect(created.status).toBe(201);
    const { id, ...rule } = appRuleSchema.parse(created.json);
    expect(rule).toEqual({ appId: "notepad.exe", styleId: "formal", keystroke: "ctrl+v" });
    expect(
      (
        await world.call("POST", "/app-rules", {
          body: { appId: "notepad.exe", keystroke: "ctrl+v" },
        })
      ).status,
    ).toBe(409);
    const edited = await world.call("PUT", `/app-rules/${id}`, {
      body: { keystroke: "ctrl+shift+v" },
    });
    expect(edited.json).toEqual({ id, appId: "notepad.exe", keystroke: "ctrl+shift+v" });
    expect((await world.call("DELETE", `/app-rules/${id}`)).status).toBe(204);
    expect((await world.call("DELETE", `/app-rules/${id}`)).status).toBe(404);
    const upper = Buffer.from("Notepad.exe").toString("base64url");
    expect((await world.call("DELETE", `/app-rules/${upper}`)).status).toBe(400);
  });

  it("round-trips an app id with path characters through its id", async () => {
    const created = await world.call("POST", "/app-rules", {
      body: { appId: "/usr/bin/My App #2 100%", keystroke: "ctrl+shift+v" },
    });
    const { id, appId } = appRuleSchema.parse(created.json);
    expect(appId).toBe("/usr/bin/my app #2 100%");
    expect(
      (await world.call("PUT", `/app-rules/${id}`, { body: { keystroke: "ctrl+v" } })).status,
    ).toBe(200);
    expect((await world.call("DELETE", `/app-rules/${id}`)).status).toBe(204);
  });

  it("refuses an unknown style, an unknown keystroke and more than 100 rules", async () => {
    expect(
      (
        await world.call("POST", "/app-rules", {
          body: { appId: "a", styleId: "nope", keystroke: "ctrl+v" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await world.call("POST", "/app-rules", { body: { appId: "a", keystroke: "alt+v" } })).status,
    ).toBe(400);
    for (let index = 0; index < 100; index += 1) {
      await world.stores.appRules.create("user-a", {
        appId: `app${String(index)}`,
        keystroke: "ctrl+v",
      });
    }
    expect(
      (await world.call("POST", "/app-rules", { body: { appId: "one-more", keystroke: "ctrl+v" } }))
        .status,
    ).toBe(400);
  });
});

describe("settings", () => {
  it("creates the user's settings on the first read with plain and es", async () => {
    const first = settingsSchema.parse((await world.call("GET", "/me/settings")).json);
    expect(first).toEqual({
      defaultStyleId: "plain",
      locale: "es",
      providers: { transcriber: "groq-whisper", refiner: "openai" },
    });
    expect(await world.stores.settings.get("user-a")).toEqual(first);
  });

  it("changes the default style to an existing one and refuses an unknown one", async () => {
    const body = {
      defaultStyleId: "formal",
      locale: "en-US",
      providers: { transcriber: "groq-whisper", refiner: "openai" },
    };
    expect((await world.call("PUT", "/me/settings", { body })).status).toBe(200);
    expect(settingsSchema.parse((await world.call("GET", "/me/settings")).json)).toEqual(body);
    const unknown = await world.call("PUT", "/me/settings", {
      body: { ...body, defaultStyleId: "nope" },
    });
    expect(unknown.status).toBe(400);
  });
});

describe("history", () => {
  it("pages the user's dictations newest first with an opaque cursor", async () => {
    world.seedDictation("user-a", "2026-10-21T08:00:00.000Z", "r1");
    world.seedDictation("user-a", "2026-10-21T09:00:00.000Z", "r2");
    world.seedDictation("user-a", "2026-10-21T10:00:00.000Z", "r3");

    const first = historyPageSchema.parse((await world.call("GET", "/dictations?limit=2")).json);
    expect(first.items.map((item) => item.text)).toEqual(["texto r3", "texto r2"]);
    expect(first.items[0]).toMatchObject({
      raw: "crudo r3",
      styleId: "plain",
      audioSeconds: 3,
      locale: "es",
    });
    expect(Object.keys(first.items[0] ?? {})).not.toContain("audio");
    const cursor = first.cursor ?? "";
    const second = historyPageSchema.parse(
      (await world.call("GET", `/dictations?limit=2&cursor=${cursor}`)).json,
    );
    expect(second.items.map((item) => item.text)).toEqual(["texto r1"]);
    expect(second.cursor).toBeUndefined();
  });

  it("answers 400 for a malformed cursor or limit", async () => {
    const forged = Buffer.from("QUOTA#2026-10-21").toString("base64url");
    for (const query of ["cursor=***", `cursor=${forged}`, "limit=0", "limit=101"]) {
      expect((await world.call("GET", `/dictations?${query}`)).status).toBe(400);
    }
  });

  it("deletes one dictation by its id", async () => {
    world.seedDictation("user-a", "2026-10-21T08:00:00.000Z", "r1");
    world.seedDictation("user-a", "2026-10-21T09:00:00.000Z", "r2");
    const { items } = historyPageSchema.parse((await world.call("GET", "/dictations")).json);
    const id = items[0]?.id ?? "";
    expect((await world.call("DELETE", `/dictations/${id}`)).status).toBe(204);
    expect((await world.call("DELETE", `/dictations/${id}`)).status).toBe(404);
    expect((await world.call("DELETE", "/dictations/not*an*id")).status).toBe(400);
    const unknown = Buffer.from("2026-10-21T07:00:00.000Z#r9").toString("base64url");
    expect((await world.call("DELETE", `/dictations/${unknown}`)).status).toBe(404);
    const after = historyPageSchema.parse((await world.call("GET", "/dictations")).json);
    expect(after.items.map((item) => item.text)).toEqual(["texto r1"]);
  });
});

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  apiErrorSchema,
  appRuleListSchema,
  appRuleSchema,
  dictationResponseSchema,
  dictionaryListSchema,
  dictionaryTermSchema,
  historyPageSchema,
  settingsSchema,
  styleListSchema,
  styleSchema,
  type DictionaryTerm,
} from "@take-my-word/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requiredEnv, signInCrewE2e, signInCrewE2eB } from "../scripts/sign-in.ts";
import { synthesize } from "./speech.ts";

const rareTerm = "Quelvarix";
const dictationTimeout = 120_000;

let url: string;
let tokenA: string;
let tokenB: string;
let rareSpeech: Buffer;
let informalSpeech: Buffer;

interface Call {
  token?: string | null;
  body?: unknown;
}

async function call(method: string, path: string, { token = tokenA, body }: Call = {}) {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, json: text === "" ? undefined : (JSON.parse(text) as unknown) };
}

async function dictate(audio: Buffer, meta: Record<string, unknown> = {}, token = tokenA) {
  const form = new FormData();
  form.append("meta", JSON.stringify({ locale: "es", ...meta }));
  form.append("audio", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "dictation");
  const response = await fetch(`${url}/dictations`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  expect(response.status).toBe(200);
  return dictationResponseSchema.parse(await response.json());
}

function subOf(token: string): string {
  const payload = token.split(".")[1] ?? "";
  return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string }).sub;
}

async function terms(token = tokenA): Promise<DictionaryTerm[]> {
  return dictionaryListSchema.parse((await call("GET", "/dictionary", { token })).json).terms;
}

const defaults = (defaultStyleId: string) => ({
  defaultStyleId,
  dictationLanguages: ["es"],
  providers: { transcriber: "groq-whisper", refiner: "openai" },
});

async function cleanUp(token: string) {
  for (const term of await terms(token)) {
    await call("DELETE", `/dictionary/${term.id}`, { token });
  }
  const { styles } = styleListSchema.parse((await call("GET", "/styles", { token })).json);
  for (const style of styles.filter((entry) => !entry.builtin)) {
    await call("DELETE", `/styles/${style.id}`, { token });
  }
  const { rules } = appRuleListSchema.parse((await call("GET", "/app-rules", { token })).json);
  for (const rule of rules) await call("DELETE", `/app-rules/${rule.id}`, { token });
  await call("PUT", "/me/settings", { token, body: defaults("plain") });
}

beforeAll(async () => {
  [tokenA, tokenB] = await Promise.all([signInCrewE2e(), signInCrewE2eB()]);
  url = requiredEnv("API_URL");
  [rareSpeech, informalSpeech] = await Promise.all([
    synthesize(`Hablé con ${rareTerm} sobre el contrato de mantenimiento.`),
    synthesize(
      "Oye, porfa mándame el informe ya, que lo necesito para la reunión de mañana, ¿vale? Gracias, crack.",
    ),
  ]);
  await cleanUp(tokenA);
  await cleanUp(tokenB);
}, 60_000);

afterAll(async () => {
  await cleanUp(tokenA);
  await cleanUp(tokenB);
}, 60_000);

describe("api routes in a deployed environment", () => {
  it.each([
    ["GET", "/dictionary"],
    ["POST", "/dictionary"],
    ["PUT", "/dictionary/eA"],
    ["DELETE", "/dictionary/eA"],
    ["GET", "/styles"],
    ["POST", "/styles"],
    ["PUT", "/styles/x"],
    ["DELETE", "/styles/x"],
    ["GET", "/app-rules"],
    ["POST", "/app-rules"],
    ["PUT", "/app-rules/eA"],
    ["DELETE", "/app-rules/eA"],
    ["GET", "/me/settings"],
    ["PUT", "/me/settings"],
    ["GET", "/dictations"],
    ["DELETE", "/dictations/eA"],
  ])("%s %s answers 401 without a token", async (method, path) => {
    const body = method === "GET" || method === "DELETE" ? undefined : {};
    expect((await call(method, path, { token: null, body })).status).toBe(401);
  });

  it(
    "keeps every item of one user invisible and untouchable for another",
    async () => {
      const term = dictionaryTermSchema.parse(
        (await call("POST", "/dictionary", { body: { term: "Privado" } })).json,
      );
      const style = styleSchema.parse(
        (await call("POST", "/styles", { body: { name: "Mío", prompt: "Breve." } })).json,
      );
      const rule = appRuleSchema.parse(
        (await call("POST", "/app-rules", { body: { appId: "private.exe", keystroke: "ctrl+v" } }))
          .json,
      );
      const dictated = await dictate(informalSpeech);
      const newestOfA = historyPageSchema.parse((await call("GET", "/dictations?limit=1")).json)
        .items[0];
      expect(newestOfA?.text).toBe(dictated.text);
      const dictationOfA = newestOfA?.id ?? "";
      const asB = { token: tokenB };

      expect(await terms(tokenB)).toEqual([]);
      const stylesOfB = styleListSchema.parse((await call("GET", "/styles", asB)).json).styles;
      expect(stylesOfB.map((entry) => entry.id)).toEqual(["plain", "casual", "formal"]);
      expect(appRuleListSchema.parse((await call("GET", "/app-rules", asB)).json).rules).toEqual(
        [],
      );
      const idsOfB: string[] = [];
      let cursor: string | undefined;
      do {
        const query = cursor === undefined ? "" : `&cursor=${cursor}`;
        const page = historyPageSchema.parse(
          (await call("GET", `/dictations?limit=100${query}`, asB)).json,
        );
        idsOfB.push(...page.items.map((item) => item.id));
        cursor = page.cursor;
      } while (cursor !== undefined);
      expect(idsOfB).not.toContain(dictationOfA);

      const forB = (body?: unknown) => ({ ...asB, body });
      expect((await call("PUT", `/dictionary/${term.id}`, forB({ aliases: [] }))).status).toBe(404);
      expect((await call("DELETE", `/dictionary/${term.id}`, asB)).status).toBe(404);
      const styleEdit = forB({ name: "x", prompt: "y" });
      expect((await call("PUT", `/styles/${style.id}`, styleEdit)).status).toBe(404);
      expect((await call("DELETE", `/styles/${style.id}`, asB)).status).toBe(404);
      expect(
        (await call("PUT", `/app-rules/${rule.id}`, forB({ keystroke: "cmd+v" }))).status,
      ).toBe(404);
      expect((await call("DELETE", `/app-rules/${rule.id}`, asB)).status).toBe(404);
      expect((await call("DELETE", `/dictations/${dictationOfA}`, asB)).status).toBe(404);
      const borrowed = forB({ appId: "b.exe", styleId: style.id, keystroke: "ctrl+v" });
      expect((await call("POST", "/app-rules", borrowed)).status).toBe(400);

      expect((await terms()).map((entry) => entry.term)).toContain("Privado");
      const stillOfA = historyPageSchema.parse((await call("GET", "/dictations?limit=1")).json);
      expect(stillOfA.items[0]?.id).toBe(dictationOfA);
      await call("DELETE", `/dictionary/${term.id}`);
      await call("DELETE", `/styles/${style.id}`);
      await call("DELETE", `/app-rules/${rule.id}`);
    },
    dictationTimeout,
  );
});

describe("dictionary in a deployed environment", () => {
  it("adds, refuses a duplicate in any case or accent, edits and deletes a term", async () => {
    const created = await call("POST", "/dictionary", {
      body: { term: "Kubernetes", aliases: ["cubernetes"] },
    });
    expect(created.status).toBe(201);
    const listed = (await terms()).find((term) => term.term === "Kubernetes");
    expect(listed).toMatchObject({ aliases: ["cubernetes"], useCount: 1 });
    expect(listed?.lastUsedAt.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));

    for (const term of ["kubernetes", "KUBÉRNETES"]) {
      const again = await call("POST", "/dictionary", { body: { term } });
      expect(again.status).toBe(409);
      expect(apiErrorSchema.parse(again.json).error.code).toBe("conflict");
    }

    const id = listed?.id ?? "";
    const edited = await call("PUT", `/dictionary/${id}`, {
      body: { aliases: ["cubernetes", "kubernetis"] },
    });
    expect(dictionaryTermSchema.parse(edited.json).aliases).toEqual(["cubernetes", "kubernetis"]);
    expect((await call("DELETE", `/dictionary/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/dictionary/${id}`)).status).toBe(404);
  });

  it("round-trips a term with a space, an accent, a slash, a hash and a percent sign", async () => {
    const term = "Año / #1 al 100%";
    const { id } = dictionaryTermSchema.parse(
      (await call("POST", "/dictionary", { body: { term } })).json,
    );
    const edited = await call("PUT", `/dictionary/${id}`, { body: { aliases: ["ano uno"] } });
    expect(edited.status).toBe(200);
    expect(dictionaryTermSchema.parse(edited.json)).toMatchObject({ term, aliases: ["ano uno"] });
    expect((await call("DELETE", `/dictionary/${id}`)).status).toBe(204);
    expect((await terms()).map((entry) => entry.term)).not.toContain(term);
  });

  it(
    "spells a rare term right only once it is in the dictionary and counts its use from the stream",
    async () => {
      const without = await dictate(rareSpeech);
      expect(without.text).not.toContain(rareTerm);

      const { id } = dictionaryTermSchema.parse(
        (await call("POST", "/dictionary", { body: { term: rareTerm } })).json,
      );
      const withTerm = await dictate(rareSpeech);
      expect(withTerm.raw).toContain(rareTerm);
      expect(withTerm.text).toContain(rareTerm);
      expect(withTerm.styleId).toBe("plain");

      const { items } = historyPageSchema.parse((await call("GET", "/dictations?limit=1")).json);
      expect(items[0]).toMatchObject({ text: withTerm.text, styleId: "plain" });

      let counted: DictionaryTerm | undefined;
      for (let attempt = 0; attempt < 30 && counted?.useCount !== 2; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        counted = (await terms()).find((term) => term.id === id);
      }
      expect(counted?.useCount).toBe(2);
      expect(counted && counted.lastUsedAt > counted.createdAt).toBe(true);
      await call("DELETE", `/dictionary/${id}`);
    },
    dictationTimeout,
  );
});

describe("styles, app rules and settings in a deployed environment", () => {
  it("lists the built-ins, refuses to change them and manages a custom style", async () => {
    const custom = styleSchema.parse(
      (await call("POST", "/styles", { body: { name: "Telegrama", prompt: "Muy breve." } })).json,
    );
    const { styles } = styleListSchema.parse((await call("GET", "/styles")).json);
    expect(styles.map((style) => style.id)).toEqual(["plain", "casual", "formal", custom.id]);
    for (const id of ["plain", "casual", "formal"]) {
      expect(
        (await call("PUT", `/styles/${id}`, { body: { name: "x", prompt: "y" } })).status,
      ).toBe(403);
      expect((await call("DELETE", `/styles/${id}`)).status).toBe(403);
    }
    const edited = await call("PUT", `/styles/${custom.id}`, {
      body: { name: "Telegrama", prompt: "Brevísimo." },
    });
    expect(styleSchema.parse(edited.json).prompt).toBe("Brevísimo.");
    expect((await call("DELETE", `/styles/${custom.id}`)).status).toBe(204);
  });

  it(
    "shapes the same recording differently under casual and formal",
    async () => {
      const casual = await dictate(informalSpeech, { styleId: "casual" });
      const formal = await dictate(informalSpeech, { styleId: "formal" });
      expect(casual.styleId).toBe("casual");
      expect(formal.styleId).toBe("formal");
      expect(formal.text).not.toBe(casual.text);
      console.info(`casual: ${casual.text}\nformal: ${formal.text}`);
    },
    dictationTimeout,
  );

  it(
    "uses the app rule's style, and the default once the rule's custom style is deleted",
    async () => {
      const rule = appRuleSchema.parse(
        (
          await call("POST", "/app-rules", {
            body: { appId: "notepad.exe", styleId: "formal", keystroke: "ctrl+v" },
          })
        ).json,
      );
      expect((await dictate(informalSpeech, { appId: "Notepad.exe" })).styleId).toBe("formal");

      const custom = styleSchema.parse(
        (await call("POST", "/styles", { body: { name: "Bloc", prompt: "Todo en minúsculas." } }))
          .json,
      );
      await call("PUT", `/app-rules/${rule.id}`, {
        body: { styleId: custom.id, keystroke: "ctrl+v" },
      });
      expect((await call("DELETE", `/styles/${custom.id}`)).status).toBe(204);
      const { rules } = appRuleListSchema.parse((await call("GET", "/app-rules")).json);
      expect(rules.find((entry) => entry.id === rule.id)).toEqual({
        id: rule.id,
        appId: "notepad.exe",
        keystroke: "ctrl+v",
      });
      expect((await dictate(informalSpeech, { appId: "notepad.exe" })).styleId).toBe("plain");
      await call("DELETE", `/app-rules/${rule.id}`);
    },
    dictationTimeout,
  );

  it(
    "creates settings on the first read and applies the default style",
    async () => {
      const table = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
      await table.send(
        new DeleteCommand({
          TableName: requiredEnv("TABLE_NAME"),
          Key: { PK: `USER#${subOf(tokenB)}`, SK: "SETTINGS" },
        }),
      );
      const first = settingsSchema.parse(
        (await call("GET", "/me/settings", { token: tokenB })).json,
      );
      expect(first).toMatchObject({
        defaultStyleId: "plain",
        locale: "en",
        dictationLanguages: ["en"],
      });

      expect((await call("PUT", "/me/settings", { body: defaults("formal") })).status).toBe(200);
      expect(settingsSchema.parse((await call("GET", "/me/settings")).json).defaultStyleId).toBe(
        "formal",
      );
      expect((await dictate(informalSpeech)).styleId).toBe("formal");
      expect((await call("PUT", "/me/settings", { body: defaults("nope") })).status).toBe(400);
    },
    dictationTimeout,
  );
});

describe("history in a deployed environment", () => {
  it("pages newest first, deletes one dictation and never carries audio", async () => {
    const first = historyPageSchema.parse((await call("GET", "/dictations?limit=2")).json);
    expect(first.items).toHaveLength(2);
    const [newest, older] = first.items;
    expect((newest?.createdAt ?? "") > (older?.createdAt ?? "")).toBe(true);
    const raw = JSON.stringify(first);
    expect(raw).not.toMatch(/audio(?!Seconds)/i);

    const second = historyPageSchema.parse(
      (await call("GET", `/dictations?limit=2&cursor=${first.cursor ?? ""}`)).json,
    );
    expect(second.items.length).toBeGreaterThan(0);
    expect((second.items[0]?.createdAt ?? "") < (older?.createdAt ?? "")).toBe(true);

    expect((await call("GET", "/dictations?cursor=bm9wZQ")).status).toBe(400);

    const id = newest?.id ?? "";
    expect((await call("DELETE", `/dictations/${id}`)).status).toBe(204);
    expect((await call("DELETE", `/dictations/${id}`)).status).toBe(404);
    const after = historyPageSchema.parse((await call("GET", "/dictations?limit=1")).json);
    expect(after.items[0]?.id).toBe(older?.id);
  });
});

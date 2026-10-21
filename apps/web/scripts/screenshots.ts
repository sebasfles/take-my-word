import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { accessClaims, sessionCookies } from "../src/lib/session.ts";
import { fakeAccessToken } from "../src/testing/tokens.ts";

const root = join(import.meta.dirname, "..");
const out = process.argv[2] ?? join(root, "..", "..", "..", "screenshots");
const apiPort = 4510;
const webPort = 4511;
const webOrigin = `http://localhost:${webPort}`;
const key = randomBytes(32);
const widths = [390, 768, 1280];

const minute = 60_000;
const day = 24 * 60 * minute;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const builtins = [
  { id: "plain", name: "Plain", prompt: "", builtin: true },
  { id: "casual", name: "Casual", prompt: "Casual", builtin: true },
  { id: "formal", name: "Formal", prompt: "Formal", builtin: true },
];

const full = {
  settings: {
    defaultStyleId: "c-slack",
    locale: "es-MX",
    providers: { transcriber: "groq-whisper", refiner: "openai" },
  },
  styles: [
    ...builtins,
    {
      id: "c-slack",
      name: "Slack corto",
      prompt:
        "Frases cortas, sin saludos ni despedidas.\nUsa minúsculas al inicio si el mensaje es informal.",
      builtin: false,
    },
    {
      id: "c-clientes",
      name: "Correo a clientes",
      prompt:
        "Trato de usted, cálido pero profesional. Cierra siempre con una frase que invite a responder, sin prometer fechas que no se dijeron.",
      builtin: false,
    },
  ],
  rules: [
    { id: "r1", appId: "slack.exe", styleId: "c-slack", keystroke: "ctrl+v" },
    { id: "r2", appId: "windowsterminal.exe", keystroke: "ctrl+shift+v" },
    { id: "r3", appId: "outlook.exe", styleId: "formal", keystroke: "ctrl+v" },
    { id: "r4", appId: "code.exe", styleId: "c-borrado", keystroke: "ctrl+shift+v" },
    {
      id: "r5",
      appId: "com.microsoft.visualstudio.enterprise.2026.exe",
      styleId: "c-clientes",
      keystroke: "shift+insert",
    },
  ],
  terms: [
    ["Kubernetes", ["kubernetis", "cubernetes"], 42, 1],
    ["Take My Word", ["teic mai word"], 18, 0],
    ["Ñandú Labs", [], 3, 2],
    ["Groq", ["grok", "grock"], 25, 40],
    ["OpenTelemetry", ["open telemetri"], 9, 3],
    ["Raúl Hernández", ["raul"], 60, 120],
  ].map(([term, aliases, useCount, days], index) => ({
    id: `t${String(index)}`,
    term,
    aliases,
    useCount,
    lastUsedAt: ago((days as number) * day),
    createdAt: ago(200 * day),
  })),
  dictations: Array.from({ length: 25 }, (_, index) => {
    const texts = [
      "Hola equipo, mañana a las diez revisamos el despliegue de Kubernetes con Raúl.",
      "Te mando el informe en cuanto termine la reunión con el cliente; si necesitas algo antes, avísame por Slack y lo vemos.",
      "",
      "Recordatorio: renovar el certificado del dominio antes del viernes.",
    ];
    const text = texts[index % texts.length] ?? "";
    return {
      id: `d${String(index)}`,
      createdAt: ago(index * 7 * 60 * minute + 5 * minute),
      locale: "es",
      text,
      raw: text === "" ? "" : `eh, ${text.toLowerCase()} este, o sea`,
      styleId: ["c-slack", "formal", "plain", "c-borrado"][index % 4],
      audioSeconds: 3.4 + (index % 5) * 6.25,
    };
  }),
};

const empty = {
  settings: {
    defaultStyleId: "plain",
    locale: "es",
    providers: { transcriber: "groq-whisper", refiner: "openai" },
  },
  styles: builtins,
  rules: [],
  terms: [],
  dictations: [],
};

function userOf(authorization: string | undefined): typeof full | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const claims = accessClaims(token);
  if (claims === null) return null;
  return claims.username === "nuevo" ? empty : full;
}

function respond(user: typeof full, url: URL): unknown {
  switch (url.pathname) {
    case "/me/settings":
      return user.settings;
    case "/styles":
      return { styles: user.styles };
    case "/app-rules":
      return { rules: user.rules };
    case "/dictionary":
      return { terms: user.terms };
    case "/dictations": {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const start = Number(url.searchParams.get("cursor") ?? "0");
      const items = user.dictations.slice(start, start + limit);
      return { items, ...(items.length === limit && { cursor: String(start + limit) }) };
    }
    default:
      return undefined;
  }
}

const api = createServer((request, response) => {
  const user = userOf(request.headers.authorization);
  const body =
    user === null || request.method !== "GET"
      ? undefined
      : respond(user, new URL(request.url ?? "/", "http://mock"));
  if (body === undefined) {
    response.writeHead(user === null ? 401 : 404).end();
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
});
await new Promise<void>((resolve) => api.listen(apiPort, resolve));

const web = spawn(join(root, "node_modules", ".bin", "next"), ["start", "-p", String(webPort)], {
  cwd: root,
  env: {
    ...process.env,
    API_URL: `http://127.0.0.1:${apiPort}`,
    USER_POOL_ID: "us-east-1_screenshots",
    USER_POOL_CLIENT_ID: "screenshots",
    WEB_COOKIE_KEY: key.toString("base64"),
    WEB_ORIGIN: webOrigin,
  },
  stdio: ["ignore", "pipe", "inherit"],
});

await new Promise<void>((resolve, reject) => {
  web.stdout.on("data", (chunk: Buffer) => {
    if (chunk.toString().includes("Ready")) resolve();
  });
  web.on("exit", (code) => {
    reject(new Error(`next start exited with ${String(code)}`));
  });
});

async function signedIn(context: BrowserContext, username = "sebastian"): Promise<void> {
  const accessToken = fakeAccessToken({
    username,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const cookies = sessionCookies(
    {
      accessToken,
      refreshToken: "screenshots",
      deviceKey: "us-east-1_screenshots",
      remember: false,
    },
    key,
  );
  await context.addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: `https://localhost:${String(webPort)}`,
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    })),
  );
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error(`${name} scrolls horizontally by ${String(overflow)} px`);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const locale of ["es", "en"] as const) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "light",
        timezoneId: "America/Mexico_City",
      });
      await context.addCookies([{ name: "tmw-lang", value: locale, url: webOrigin }]);
      const page = await context.newPage();
      const shots: [string, string][] = [
        ["landing", "/"],
        ["sign-in", "/sign-in"],
      ];
      for (const [name, path] of shots) {
        await page.goto(`${webOrigin}${path}`);
        await page.screenshot({
          path: join(out, `${name}-${locale}-${String(width)}.png`),
          fullPage: true,
        });
      }
      await page.goto(`${webOrigin}/sign-in`);
      await page.getByRole("textbox").first().fill("sebastian");
      await page.locator("input[type=password]").fill("not-the-password");
      await page.route("**/api/session", (route) =>
        route.fulfill({ status: 401, json: { error: "invalid_credentials" } }),
      );
      await page.getByRole("button", { name: locale === "es" ? "Entrar" : "Sign in" }).click();
      await page.locator("#sign-in-error").waitFor();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: join(out, `sign-in-error-${locale}-${String(width)}.png`),
        fullPage: true,
      });
      await page.unroute("**/api/session");
      await page.route("**/api/session", (route) =>
        route.fulfill({ status: 200, json: { step: "new-password" } }),
      );
      await page.goto(`${webOrigin}/sign-in`);
      await page.getByRole("textbox").first().fill("sebastian");
      await page.locator("input[type=password]").fill("temporary-password");
      await page.getByRole("button", { name: locale === "es" ? "Entrar" : "Sign in" }).click();
      await page.locator("#new-password").waitFor();
      await page.mouse.move(0, 0);
      await page.screenshot({
        path: join(out, `sign-in-new-password-${locale}-${String(width)}.png`),
        fullPage: true,
      });
      const pages: [string, string, string][] = [
        ["account", "/app", "default-style"],
        ["dictionary", "/app/dictionary", "terms"],
        ["styles", "/app/styles", "builtin-style"],
        ["rules", "/app/rules", "rules"],
        ["history", "/app/history", "dictations"],
      ];
      await signedIn(context);
      for (const [name, path, testId] of pages) {
        await page.goto(`${webOrigin}${path}`);
        await page.getByTestId(testId).first().waitFor();
        await shoot(page, `${name}-${locale}-${String(width)}`);
      }
      await page.goto(`${webOrigin}/app/history`);
      await page.getByTestId("dictation").first().locator("summary").click();
      await page.getByTestId("dictation").nth(1).getByRole("button").click();
      await shoot(page, `history-open-${locale}-${String(width)}`);
      await signedIn(context, "nuevo");
      for (const [name, path] of pages) {
        await page.goto(`${webOrigin}${path}`);
        await page.getByTestId(name === "account" ? "default-style" : "empty-state").waitFor();
        await shoot(page, `${name}-empty-${locale}-${String(width)}`);
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  web.kill();
  api.close();
}
process.stdout.write(`screenshots in ${out}\n`);

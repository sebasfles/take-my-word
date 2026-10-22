import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { accessClaims, sessionCookies } from "../src/lib/session.ts";
import { fakeAccessToken } from "../src/testing/tokens.ts";

const root = join(import.meta.dirname, "..");
const out = process.argv[2] ?? join(root, "..", "..", "..", "screenshots");
const only = process.argv[3];
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
    dictationLanguages: ["es", "en"],
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
      "Resumen de la reunión con Ñandú Labs: acordamos migrar el clúster de Kubernetes en dos fases, primero los servicios de lectura y después los de escritura. Raúl se encarga del plan de reversión y de avisar a soporte con una semana de anticipación. Quedó pendiente confirmar el presupuesto de OpenTelemetry, que depende de la cotización que llega el lunes; si no llega, lo revisamos el miércoles en la llamada de seguimiento con el cliente y ajustamos las fechas.",
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
    locale: "en",
    dictationLanguages: ["en"],
    providers: { transcriber: "groq-whisper", refiner: "openai" },
  },
  styles: builtins,
  rules: [],
  terms: [],
  dictations: [],
};

type Mode = "full" | "empty" | "slow" | "broken";

const modes: Record<string, Mode> = { nuevo: "empty", lento: "slow", roto: "broken" };

function userOf(authorization: string | undefined): Mode | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const claims = accessClaims(token);
  if (claims === null) return null;
  return modes[claims.username] ?? "full";
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
  const mode = userOf(request.headers.authorization);
  if (mode === "broken") {
    response.writeHead(503).end();
    return;
  }
  const body =
    mode === null || request.method !== "GET"
      ? undefined
      : respond(mode === "empty" ? empty : full, new URL(request.url ?? "/", "http://mock"));
  const send = () => {
    if (body === undefined) {
      response.writeHead(mode === null ? 401 : 404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (mode === "slow") setTimeout(send, 20_000);
  else send();
});
await new Promise<void>((resolve) => api.listen(apiPort, resolve));

const web = spawn(join(root, "node_modules", ".bin", "next"), ["start", "-p", String(webPort)], {
  cwd: root,
  env: {
    ...process.env,
    API_URL: `http://127.0.0.1:${String(apiPort)}`,
    USER_POOL_ID: "us-east-1_screenshots",
    USER_POOL_CLIENT_ID: "screenshots",
    WEB_COOKIE_KEY: key.toString("base64"),
    WEB_ORIGIN: webOrigin,
    TMW_GALLERY: "1",
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

const demoFrame = 7.4;

async function settle(page: Page, at = demoFrame): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(async (seconds) => {
    window.scrollTo({ top: 0, behavior: "instant" });
    await document.fonts.ready;
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = seconds * 1000;
    }
  }, at);
}

async function shoot(
  page: Page,
  path: string,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  await settle(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) throw new Error(`${path} scrolls horizontally by ${String(overflow)} px`);
  mkdirSync(join(out, path, ".."), { recursive: true });
  await page.screenshot({ path: join(out, `${path}.png`), fullPage: options.fullPage ?? true });
}

const pages: [string, string, string][] = [
  ["account", "/app", "default-style"],
  ["dictionary", "/app/dictionary", "terms"],
  ["styles", "/app/styles", "builtin-style"],
  ["rules", "/app/rules", "rules"],
  ["history", "/app/history", "dictations"],
];

const labels = {
  en: { submit: "Sign in" },
  es: { submit: "Entrar" },
} as const;

async function shootPages(browser: Browser): Promise<void> {
  for (const locale of ["en", "es"] as const) {
    for (const scheme of ["light", "dark"] as const) {
      for (const width of widths) {
        const name = (page: string) => join(locale, scheme, `${page}-${String(width)}`);
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 2,
          colorScheme: scheme,
          timezoneId: "America/Mexico_City",
        });
        await context.addCookies([{ name: "tmw-lang", value: locale, url: webOrigin }]);
        const page = await context.newPage();
        await page.goto(`${webOrigin}/`);
        await shoot(page, name("landing"));
        await page.goto(`${webOrigin}/sign-in`);
        await shoot(page, name("sign-in"));

        await page.route("**/api/session", (route) =>
          route.fulfill({ status: 401, json: { error: "invalid_credentials" } }),
        );
        await page.locator("#username").fill("sebastian");
        await page.locator("#password").fill("not-the-password");
        await page.getByRole("button", { name: labels[locale].submit }).click();
        await page.locator("#sign-in-error").waitFor();
        await shoot(page, name("sign-in-error"));
        await page.unroute("**/api/session");

        await page.route("**/api/session", (route) =>
          route.fulfill({ status: 200, json: { step: "new-password" } }),
        );
        await page.goto(`${webOrigin}/sign-in`);
        await page.locator("#username").fill("sebastian");
        await page.locator("#password").fill("temporary-password");
        await page.getByRole("button", { name: labels[locale].submit }).click();
        await page.locator("#new-password").waitFor();
        await shoot(page, name("choose-password"));
        await page.unroute("**/api/session");

        await signedIn(context);
        for (const [pageName, path, testId] of pages) {
          await page.goto(`${webOrigin}${path}`);
          await page.getByTestId(testId).first().waitFor();
          await shoot(page, name(pageName));
        }
        await page.goto(`${webOrigin}/app/history`);
        await page.getByTestId("dictation").first().locator("summary").click();
        await page.getByTestId("dictation").nth(1).getByRole("button").first().click();
        await shoot(page, name("history-open"));

        for (const [user, state, testId] of [
          ["nuevo", "empty", "empty-state"],
          ["roto", "error", "error-state"],
        ] as const) {
          await signedIn(context, user);
          for (const [pageName, path] of pages) {
            await page.goto(`${webOrigin}${path}`);
            const target = state === "empty" && pageName === "account" ? "default-style" : testId;
            await page.getByTestId(target).first().waitFor();
            await shoot(page, name(`${pageName}-${state}`));
          }
        }

        await signedIn(context, "lento");
        for (const [pageName, path] of pages) {
          await page.goto(`${webOrigin}${path}`, { waitUntil: "commit" });
          await page.getByTestId("loading-state").waitFor();
          await shoot(page, name(`${pageName}-loading`));
        }
        await context.close();
      }
    }
  }
}

async function shootHero(browser: Browser): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [390, 844],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      await page.goto(`${webOrigin}/`);
      await shoot(page, join("hero", `first-screen-${scheme}-${String(width)}x${String(height)}`), {
        fullPage: false,
      });
      await settle(page, 3);
      await page.screenshot({
        path: join(out, "hero", `listening-${scheme}-${String(width)}x${String(height)}.png`),
      });
      await context.close();
    }
  }

  for (const width of [390, 1280]) {
    const viewport = { width, height: width === 390 ? 844 : 800 };
    const reduced = await browser.newContext({
      viewport,
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const still = await reduced.newPage();
    await still.goto(`${webOrigin}/`);
    await still.evaluate(() => document.fonts.ready);
    await still.screenshot({ path: join(out, "hero", `reduced-motion-${String(width)}.png`) });
    await reduced.close();

    const videoDir = join(out, "hero", "video-tmp");
    const recording = await browser.newContext({
      viewport,
      recordVideo: { dir: videoDir, size: viewport },
    });
    const page = await recording.newPage();
    await page.goto(`${webOrigin}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(10_000);
    const video = page.video();
    await recording.close();
    if (video !== null)
      renameSync(await video.path(), join(out, "hero", `loop-${String(width)}.webm`));
  }

  const icons = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await icons.newPage();
  await page.goto(`${webOrigin}/manifest.webmanifest`);
  await page.setContent(
    `<body style="margin:0;padding:8px;background:#ececec;display:flex;gap:8px;align-items:center">
      <img src="${webOrigin}/static/favicon.ico" width="16" height="16">
      <img src="${webOrigin}/static/favicon.svg" width="16" height="16">
      <img src="${webOrigin}/static/favicon.ico" width="32" height="32">
      <img src="${webOrigin}/static/apple-touch-icon.png" width="60" height="60">
    </body>`,
  );
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: join(out, "hero", "favicon-16.png"), fullPage: true });
  await icons.close();
}

async function shootGallery(browser: Browser): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: scheme,
      });
      const page = await context.newPage();
      await page.goto(`${webOrigin}/gallery`);
      await shoot(page, join("gallery", `primitives-${scheme}-${String(width)}`));
      await page.getByRole("button", { name: "Open dialog" }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(out, "gallery", `dialog-${scheme}-${String(width)}.png`),
      });
      await context.close();
    }
  }
}

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  if (only === undefined || only === "hero") await shootHero(browser);
  if (only === undefined || only === "gallery") await shootGallery(browser);
  if (only === undefined || only === "pages") await shootPages(browser);
} finally {
  await browser.close();
  web.kill();
  api.close();
}
process.stdout.write(`screenshots in ${out}\n`);

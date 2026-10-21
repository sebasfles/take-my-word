import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { chromium, type BrowserContext } from "@playwright/test";
import { sessionCookies } from "../src/lib/session.ts";
import { fakeAccessToken } from "../src/testing/tokens.ts";

const root = join(import.meta.dirname, "..");
const out = process.argv[2] ?? join(root, "..", "..", "..", "screenshots");
const apiPort = 4510;
const webPort = 4511;
const webOrigin = `http://localhost:${webPort}`;
const key = randomBytes(32);
const widths = [390, 768, 1280];

const api = createServer((request, response) => {
  if (request.url === "/me/settings" && request.headers.authorization?.startsWith("Bearer ")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        defaultStyleId: "formal",
        locale: "es",
        providers: { transcriber: "groq-whisper", refiner: "openai" },
      }),
    );
    return;
  }
  response.writeHead(401).end();
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

async function signedIn(context: BrowserContext): Promise<void> {
  const accessToken = fakeAccessToken({
    username: "sebastian",
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

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const locale of ["es", "en"] as const) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: 2,
        colorScheme: "light",
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
      await page.screenshot({
        path: join(out, `sign-in-error-${locale}-${String(width)}.png`),
        fullPage: true,
      });
      await signedIn(context);
      await page.goto(`${webOrigin}/app`);
      await page.getByTestId("default-style").waitFor();
      await page.screenshot({
        path: join(out, `app-${locale}-${String(width)}.png`),
        fullPage: true,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
  web.kill();
  api.close();
}
process.stdout.write(`screenshots in ${out}\n`);

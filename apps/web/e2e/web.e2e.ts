import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

const username = env("CREW_E2E_USERNAME");
const password = env("CREW_E2E_PASSWORD");
const releases = "https://github.com/sebasfles/take-my-word/releases/latest";

async function signIn(page: Page, options: { remember: boolean }): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  if (options.remember) await page.getByLabel("Recordarme en este navegador").check();
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("username")).toHaveText(username);
}

async function signOut(page: Page): Promise<void> {
  await page.goto("/app");
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

const emptyBodyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

async function signOutFromPage(page: Page): Promise<void> {
  if (!page.url().startsWith("https://")) await page.goto("/");
  await page.evaluate(async (hash) => {
    await fetch("/api/session/sign-out", {
      method: "POST",
      headers: { "x-amz-content-sha256": hash },
    });
  }, emptyBodyHash);
}

async function restart(browser: Browser, context: BrowserContext): Promise<BrowserContext> {
  const survivors = (await context.cookies()).filter((cookie) => cookie.expires !== -1);
  const restarted = await browser.newContext();
  await restarted.addCookies(survivors);
  return restarted;
}

test("serves the Spanish landing with the download link and switches to English", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const headers = response?.headers() ?? {};
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-cache"]).not.toMatch(/^Hit/);

  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByText("Tu palabra, nuestra orden.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Descargar para Windows" })).toHaveAttribute(
    "href",
    releases,
  );

  await page.getByRole("button", { name: "Ver en inglés" }).click();
  await expect(page.getByText("Your Word, Our Command.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("link", { name: "Download for Windows" })).toHaveAttribute(
    "href",
    releases,
  );
  await page.reload();
  await expect(page.getByText("Your Word, Our Command.")).toBeVisible();
});

test("serves the static assets from the bucket with immutable caching", async ({ page }) => {
  const assets: { url: string; cacheControl: string | undefined; server: string | undefined }[] =
    [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/_next/static/")) {
      assets.push({
        url: response.url(),
        cacheControl: response.headers()["cache-control"],
        server: response.headers().server,
      });
    }
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(assets.length).toBeGreaterThan(0);
  for (const asset of assets) {
    expect(asset.cacheControl).toBe("public,max-age=31536000,immutable");
    expect(asset.server).toBe("AmazonS3");
  }
  const icon = await page.request.get("/static/icon.svg");
  expect(icon.status()).toBe(200);
  expect(icon.headers().server).toBe("AmazonS3");
});

test("refuses a wrong password with one generic message", async ({ page, context }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Usuario").fill(username);
  await page.getByLabel("Contraseña", { exact: true }).fill("not-the-password-1A");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("#sign-in-error")).toHaveText("Usuario o contraseña incorrectos.");
  expect(await context.cookies()).toEqual([]);
});

test("sends a visitor without a session from /app to sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("signs in to /app with the API's default style, and signs out for good", async ({
  page,
  context,
  browser,
}) => {
  try {
    await signIn(page, { remember: false });
    await expect(page.getByTestId("default-style")).toHaveText(/^[\w-]+$/);

    const cookies = await context.cookies();
    const session = cookies.filter((cookie) => cookie.name.startsWith("__Host-tmw-"));
    expect(session).toHaveLength(2);
    for (const cookie of session) {
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", expires: -1 });
    }

    const restarted = await restart(browser, context);
    try {
      const restartedPage = await restarted.newPage();
      await restartedPage.goto("/app");
      await expect(restartedPage).toHaveURL(/\/sign-in$/);
    } finally {
      await restarted.close();
    }

    await signOut(page);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("__Host-"))).toEqual(
      [],
    );
  } finally {
    await signOutFromPage(page);
  }
});

test("keeps a remembered session across a browser restart", async ({ page, context, browser }) => {
  try {
    await signIn(page, { remember: true });
    const session = (await context.cookies()).filter((cookie) =>
      cookie.name.startsWith("__Host-tmw-"),
    );
    for (const cookie of session) {
      expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(399 * 24 * 60 * 60 * 1000);
    }

    const restarted = await restart(browser, context);
    try {
      const restartedPage = await restarted.newPage();
      await restartedPage.goto("/app");
      await expect(restartedPage.getByTestId("username")).toHaveText(username);
      await signOut(restartedPage);
    } finally {
      await restarted.close();
    }
  } finally {
    await signOutFromPage(page);
  }
});

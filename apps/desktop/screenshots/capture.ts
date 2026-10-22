import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import type { Language, MessageId } from "../src/i18n.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: node screenshots/capture.ts <output-dir> [name-prefix,...]");
  process.exit(2);
}
const only = process.argv[3]?.split(",") ?? [];

const here = import.meta.dirname;

interface Size {
  width: number;
  height: number;
}

const windowSizes: Record<string, Size[]> = {
  account: [{ width: 440, height: 560 }],
  "first-run": [{ width: 520, height: 470 }],
  update: [{ width: 460, height: 400 }],
  overlay: [{ width: 480, height: 96 }],
  settings: [
    { width: 380, height: 640 },
    { width: 880, height: 640 },
    { width: 1280, height: 800 },
  ],
};

const appBackdrops = { light: "#ffffff", dark: "#1f1f1f" };

const viewOf = (query: string) => new URLSearchParams(query).get("view") ?? "settings";

type Text = (id: MessageId, values?: Record<string, string>) => string;

interface Shot {
  name: string;
  query: string;
  act?: (page: Page, text: Text) => Promise<void>;
}

const pressShortcut = async (page: Page, text: Text) => {
  await page.getByRole("button", { name: text("settings.shortcut.change") }).click();
  await page.getByText(text("settings.shortcut.listening")).waitFor();
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
};

const signIn = async (page: Page, text: Text) => {
  await page.getByLabel(text("signIn.username")).fill("sebastian");
  await page.getByLabel(text("signIn.password")).fill("not-a-real-password");
  await page.getByRole("button", { name: text("signIn.submit") }).click();
};

const choosePassword = async (page: Page, text: Text) => {
  await signIn(page, text);
  await page.getByRole("heading", { name: text("choosePassword.title") }).waitFor();
};

const shots: Shot[] = [
  { name: "account-sign-in", query: "view=account" },
  {
    name: "account-sign-in-error",
    query: "view=account&signin=wrong",
    act: async (page, text) => {
      await signIn(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "account-choose-password",
    query: "view=account&signin=new-password",
    act: choosePassword,
  },
  {
    name: "account-choose-password-error",
    query: "view=account&signin=new-password&password=weak",
    act: async (page, text) => {
      await choosePassword(page, text);
      await page.getByLabel(text("choosePassword.new")).fill("not-a-real-password");
      await page.getByLabel(text("choosePassword.repeat")).fill("not-a-real-password");
      await page.getByRole("button", { name: text("choosePassword.submit") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "account-onboarding",
    query: "view=account&step=onboarding",
    act: async (page, text) => {
      await page.getByRole("radio", { name: text("style.plain.name") }).waitFor();
    },
  },
  {
    name: "account-onboarding-error",
    query: "view=account&step=onboarding&styles=fail",
    act: async (page) => {
      await page.getByRole("alert").waitFor();
    },
  },
  { name: "first-run-ready", query: "view=first-run" },
  { name: "first-run-microphone-blocked", query: "view=first-run&mic=denied" },
  { name: "first-run-microphone-missing", query: "view=first-run&mic=missing" },
  {
    name: "settings-idle",
    query: "view=settings",
    act: async (page) => {
      await page.locator("kbd", { hasText: "Win" }).waitFor();
    },
  },
  {
    name: "settings-account",
    query: "view=settings&section=account",
    act: async (page, text) => {
      await page
        .getByText(text("settings.account.signedInAs", { username: "sebastian" }))
        .waitFor();
    },
  },
  {
    name: "settings-signed-out",
    query: "view=settings&section=account&account=signed-out",
    act: async (page, text) => {
      await page.getByText(text("settings.account.signedOut")).waitFor();
    },
  },
  {
    name: "settings-listening",
    query: "view=settings",
    act: async (page, text) => {
      await page.getByRole("button", { name: text("settings.shortcut.change") }).click();
      await page.getByText(text("settings.shortcut.listening")).waitFor();
    },
  },
  {
    name: "settings-proposed",
    query: "view=settings",
    act: async (page, text) => {
      await pressShortcut(page, text);
      await page.getByRole("button", { name: text("common.save") }).waitFor();
    },
  },
  {
    name: "settings-error",
    query: "view=settings&propose=altgr",
    act: async (page, text) => {
      await pressShortcut(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-autostart-error",
    query: "view=settings&autostart-fails=1",
    act: async (page) => {
      await page.getByRole("switch").click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary",
    query: "view=settings&section=dictionary",
    act: async (page) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
    },
  },
  {
    name: "settings-dictionary-empty",
    query: "view=settings&section=dictionary&data=empty",
    act: async (page, text) => {
      await page.getByText(text("dictionary.empty")).waitFor();
    },
  },
  {
    name: "settings-dictionary-add-word",
    query: "view=settings&section=dictionary&focus=add",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByLabel(text("dictionary.term")).fill("Ñuñoa");
    },
  },
  {
    name: "settings-dictionary-error",
    query: "view=settings&section=dictionary",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByRole("button", { name: text("dictionary.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary-duplicate",
    query: "view=settings&section=dictionary",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByLabel(text("dictionary.term")).fill("kubernetes");
      await page.getByRole("button", { name: text("dictionary.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary-edit",
    query: "view=settings&section=dictionary",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-dictionary-delete",
    query: "view=settings&section=dictionary",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.delete") })
        .first()
        .click();
      await page.getByText(text("common.confirmDelete")).waitFor();
    },
  },
  {
    name: "settings-dictionary-failed",
    query: "view=settings&section=dictionary&fail=listTerms",
    act: async (page) => {
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-styles",
    query: "view=settings&section=styles",
    act: async (page) => {
      await page.getByText("Correos a clientes").first().waitFor();
    },
  },
  {
    name: "settings-styles-empty",
    query: "view=settings&section=styles&data=empty",
    act: async (page, text) => {
      await page.getByText(text("styles.customEmpty")).waitFor();
    },
  },
  {
    name: "settings-styles-saved",
    query: "view=settings&section=styles",
    act: async (page, text) => {
      await page.getByRole("radio", { name: text("style.casual.name") }).check();
      await page.getByRole("button", { name: text("common.save") }).click();
      await page.getByText(text("common.saved")).waitFor();
    },
  },
  {
    name: "settings-styles-error",
    query: "view=settings&section=styles",
    act: async (page, text) => {
      await page.getByLabel(text("styles.name")).fill("Notas rápidas");
      await page.getByRole("button", { name: text("styles.create") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-styles-edit",
    query: "view=settings&section=styles",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-styles-delete",
    query: "view=settings&section=styles",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.delete") })
        .first()
        .click();
      await page.getByText(text("styles.confirmDelete")).waitFor();
    },
  },
  {
    name: "settings-app-rules",
    query: "view=settings&section=appRules",
    act: async (page) => {
      await page.getByText("windowsterminal.exe", { exact: true }).waitFor();
    },
  },
  {
    name: "settings-app-rules-empty",
    query: "view=settings&section=appRules&data=empty",
    act: async (page, text) => {
      await page.getByText(text("appRules.empty")).waitFor();
    },
  },
  {
    name: "settings-app-rules-duplicate",
    query: "view=settings&section=appRules",
    act: async (page, text) => {
      await page.getByText("windowsterminal.exe", { exact: true }).waitFor();
      await page.getByLabel(text("appRules.app")).fill("Notepad.exe");
      await page.getByRole("button", { name: text("appRules.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-app-rules-edit",
    query: "view=settings&section=appRules",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-history",
    query: "view=settings&section=history",
    act: async (page) => {
      await page.getByText("Compra pan y leche.").waitFor();
    },
  },
  {
    name: "settings-history-empty",
    query: "view=settings&section=history&data=empty",
    act: async (page, text) => {
      await page.getByText(text("history.empty")).waitFor();
    },
  },
  {
    name: "settings-history-raw",
    query: "view=settings&section=history",
    act: async (page, text) => {
      await page.getByText(text("history.raw")).first().click();
      await page
        .getByRole("button", { name: text("history.copy") })
        .first()
        .click();
      await page.getByText(text("history.copied")).waitFor();
    },
  },
  {
    name: "settings-history-delete",
    query: "view=settings&section=history",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.delete") })
        .first()
        .click();
      await page.getByText(text("common.confirmDelete")).waitFor();
    },
  },
  { name: "update-available", query: "view=update&update=available" },
  { name: "update-downloading", query: "view=update&update=downloading" },
  { name: "update-installing", query: "view=update&update=installing" },
  { name: "update-failed", query: "view=update&update=failed" },
  { name: "overlay-listening", query: "view=overlay&overlay=listening" },
  { name: "overlay-listening-silent", query: "view=overlay&overlay=listening-silent" },
  { name: "overlay-processing", query: "view=overlay&overlay=processing" },
  { name: "overlay-error", query: "view=overlay&overlay=error" },
  { name: "overlay-error-microphone", query: "view=overlay&overlay=error-microphone" },
  { name: "overlay-error-quota", query: "view=overlay&overlay=error-quota" },
  { name: "overlay-error-too-long", query: "view=overlay&overlay=error-too-long" },
  { name: "overlay-error-format", query: "view=overlay&overlay=error-format" },
  { name: "overlay-error-sign-in", query: "view=overlay&overlay=error-sign-in" },
];

const server = await createServer({
  configFile: join(here, "..", "vite.config.ts"),
  root: join(here, ".."),
  logLevel: "error",
  server: { port: 0 },
  resolve: {
    alias: {
      "@tauri-apps/api/core": join(here, "tauri-core.ts"),
      "@tauri-apps/api/event": join(here, "tauri-event.ts"),
    },
  },
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error("the preview server has no local URL");

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const languages: Language[] = ["es", "en"];
const dictionary = (language: Language) =>
  JSON.parse(readFileSync(join(here, "..", "src", "i18n", `${language}.json`), "utf8")) as Record<
    MessageId,
    string
  >;

try {
  for (const language of languages) {
    const messages = dictionary(language);
    const text: Text = (id, values = {}) =>
      messages[id].replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
    for (const colorScheme of ["dark", "light"] as const) {
      const context = await browser.newContext({ colorScheme, deviceScaleFactor: 1 });
      for (const shot of shots) {
        if (only.length > 0 && !only.some((prefix) => shot.name.startsWith(prefix))) continue;
        const view = viewOf(shot.query);
        for (const size of windowSizes[view] ?? []) {
          const page = await context.newPage();
          await page.setViewportSize(size);
          await page.goto(`${base}?${shot.query}&lang=${language}`);
          if (view === "overlay") {
            await page.addStyleTag({
              content: `html, body { background: ${appBackdrops[colorScheme]} !important; }`,
            });
            await page.locator(".tmw-overlay").waitFor();
          } else {
            await page.getByRole("heading").first().waitFor();
          }
          await shot.act?.(page, text);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(200);
          const overflow = await page.evaluate(() => ({
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            down: document.documentElement.scrollHeight > document.documentElement.clientHeight,
          }));
          if (overflow.sideways) {
            throw new Error(`${shot.name} scrolls sideways at ${String(size.width)} px`);
          }
          if (overflow.down && view !== "settings") {
            throw new Error(`${shot.name} does not fit its ${String(size.height)} px window`);
          }
          const file = `${shot.name}-${language}-${String(size.width)}-${colorScheme}.png`;
          await page.screenshot({ path: join(out, file), fullPage: view === "settings" });
          await page.close();
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`screenshots written to ${out}`);

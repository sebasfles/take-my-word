import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import type { Language, MessageId } from "../src/i18n.ts";

const out = process.argv[2];
if (!out) {
  console.error("usage: node screenshots/capture.ts <output-dir>");
  process.exit(2);
}

const here = import.meta.dirname;
const widths = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

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
  { name: "update-available", query: "view=update&update=available" },
  { name: "update-available-en", query: "view=update&update=available&lang=en" },
  { name: "update-downloading", query: "view=update&update=downloading" },
  { name: "update-installing", query: "view=update&update=installing" },
  { name: "update-failed", query: "view=update&update=failed" },
  { name: "overlay-listening", query: "view=overlay&overlay=listening" },
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
      for (const size of widths) {
        if (colorScheme === "light" && size.width !== 1280) continue;
        const context = await browser.newContext({ viewport: size, colorScheme });
        for (const shot of shots) {
          const page = await context.newPage();
          await page.goto(`${base}?${shot.query}&lang=${language}`);
          if (shot.query.includes("view=overlay")) {
            await page.addStyleTag({ content: "html, body { background: #52525b !important; }" });
            await page.locator(".pill").waitFor();
          } else {
            await page.getByRole("heading").first().waitFor();
          }
          await shot.act?.(page, text);
          await page.waitForTimeout(200);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
          );
          if (overflow)
            throw new Error(`${shot.name} scrolls sideways at ${String(size.width)} px`);
          const light = colorScheme === "light" ? "-light" : "";
          const file = `${shot.name}-${language}-${String(size.width)}${light}.png`;
          await page.screenshot({ path: join(out, file), fullPage: true });
          await page.close();
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`screenshots written to ${out}`);

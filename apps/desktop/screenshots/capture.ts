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

const sizes = JSON.parse(readFileSync(join(here, "..", "src", "windows.json"), "utf8")) as {
  main: Size & { minWidth: number; minHeight: number };
  overlay: Size;
  update: { width: number; minHeight: number };
};

const windowSizes: Record<string, Size[]> = {
  update: [{ width: sizes.update.width, height: sizes.update.minHeight }],
  overlay: [sizes.overlay],
  main: [
    { width: sizes.main.minWidth, height: sizes.main.minHeight },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ],
};

const appBackdrops = { light: "#ffffff", dark: "#1f1f1f" };

const viewOf = (query: string) => new URLSearchParams(query).get("view") ?? "main";

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

const welcomed = async (page: Page, text: Text) => {
  await page.getByRole("button", { name: text("welcome.start") }).click();
  await page.getByRole("heading", { name: text("signIn.title") }).waitFor();
};

const choosePassword = async (page: Page, text: Text) => {
  await welcomed(page, text);
  await signIn(page, text);
  await page.getByRole("heading", { name: text("choosePassword.title") }).waitFor();
};

const onboardTo = (heading: MessageId, steps: number) => async (page: Page, text: Text) => {
  await welcomed(page, text);
  await signIn(page, text);
  for (let step = 0; step < steps; step += 1) {
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.getByRole("button", { name: text("onboarding.next") }).click();
  }
  await page.getByRole("heading", { name: text(heading) }).waitFor();
};

const shown = (heading: MessageId) => async (page: Page, text: Text) => {
  await page.getByRole("heading", { name: text(heading) }).waitFor();
};

const general = async (page: Page) => {
  await page.locator("kbd", { hasText: "Win" }).first().waitFor();
};

const fresh = "view=main&state=fresh";

const shots: Shot[] = [
  { name: "onboarding-welcome", query: fresh, act: shown("welcome.title") },
  { name: "onboarding-sign-in", query: fresh, act: welcomed },
  {
    name: "onboarding-sign-in-error",
    query: `${fresh}&signin=wrong`,
    act: async (page, text) => {
      await welcomed(page, text);
      await signIn(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "onboarding-server",
    query: fresh,
    act: async (page, text) => {
      await welcomed(page, text);
      await page.getByRole("button", { name: text("signIn.ownServer") }).click();
      await page.getByRole("heading", { name: text("server.title") }).waitFor();
    },
  },
  {
    name: "onboarding-server-error",
    query: `${fresh}&server-error=server.notTakeMyWord`,
    act: async (page, text) => {
      await welcomed(page, text);
      await page.getByRole("button", { name: text("signIn.ownServer") }).click();
      await page.getByLabel(text("server.domain")).fill("example.com");
      await page.getByRole("button", { name: text("server.submit") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "onboarding-sign-in-own-server",
    query: `${fresh}&server=dictation.example.com`,
    act: async (page, text) => {
      await welcomed(page, text);
      await page.getByRole("button", { name: text("signIn.officialServer") }).waitFor();
    },
  },
  {
    name: "onboarding-choose-password",
    query: `${fresh}&signin=new-password`,
    act: choosePassword,
  },
  {
    name: "onboarding-choose-password-error",
    query: `${fresh}&signin=new-password&password=weak`,
    act: async (page, text) => {
      await choosePassword(page, text);
      await page.getByLabel(text("choosePassword.new")).fill("not-a-real-password");
      await page.getByLabel(text("choosePassword.repeat")).fill("not-a-real-password");
      await page.getByRole("button", { name: text("choosePassword.submit") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  { name: "onboarding-microphone", query: fresh, act: onboardTo("microphone.title", 0) },
  {
    name: "onboarding-microphone-blocked",
    query: `${fresh}&mic=denied`,
    act: async (page, text) => {
      await onboardTo("microphone.title", 0)(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "onboarding-microphone-missing",
    query: `${fresh}&mic=missing`,
    act: async (page, text) => {
      await onboardTo("microphone.title", 0)(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  { name: "onboarding-hotkey", query: fresh, act: onboardTo("hotkey.title", 1) },
  { name: "onboarding-languages", query: fresh, act: onboardTo("languages.title", 2) },
  { name: "onboarding-context", query: fresh, act: onboardTo("context.title", 3) },
  {
    name: "onboarding-context-full",
    query: fresh,
    act: async (page, text) => {
      await onboardTo("context.title", 3)(page, text);
      for (const pick of ["software-development", "data-ai", "research-academia"] as const) {
        await page.getByRole("checkbox", { name: text(`context.pick.${pick}`) }).check();
      }
      await page.getByLabel(text("context.detail")).fill(text("context.detail.placeholder"));
    },
  },
  {
    name: "onboarding-style",
    query: fresh,
    act: async (page, text) => {
      await onboardTo("style.title", 4)(page, text);
      await page.getByRole("radio", { name: text("style.formal.name") }).check();
    },
  },
  {
    name: "onboarding-style-error",
    query: `${fresh}&styles=fail`,
    act: async (page, text) => {
      await welcomed(page, text);
      await signIn(page, text);
      await page.getByRole("button", { name: text("onboarding.next") }).click();
      await page.getByRole("button", { name: text("onboarding.next") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "onboarding-ready",
    query: fresh,
    act: async (page, text) => {
      await onboardTo("style.title", 4)(page, text);
      await page.getByRole("button", { name: text("onboarding.next") }).click();
      await page.getByRole("heading", { name: text("ready.title") }).waitFor();
    },
  },
  {
    name: "onboarding-signed-out",
    query: "view=main&state=signed-out",
    act: shown("signIn.title"),
  },
  {
    name: "onboarding-new-user-style",
    query: "view=main&state=new-user",
    act: async (page, text) => {
      await page.getByRole("button", { name: text("onboarding.next") }).click();
      await page.getByRole("heading", { name: text("context.title") }).waitFor();
      await page.getByRole("button", { name: text("onboarding.next") }).click();
      await page.getByRole("heading", { name: text("style.title") }).waitFor();
    },
  },
  { name: "settings-idle", query: "view=main", act: general },
  { name: "settings-hands-free-note", query: "view=main&note=1", act: general },
  {
    name: "settings-context-empty-no-usage",
    query: "view=main&context=empty&usage=none",
    act: general,
  },
  { name: "settings-usage-over", query: "view=main&usage=over", act: general },
  {
    name: "settings-idle-dev",
    query: "view=main&build=dev",
    act: async (page) => {
      await page.locator("kbd", { hasText: "Alt" }).first().waitFor();
    },
  },
  {
    name: "settings-account",
    query: "view=main&section=account",
    act: async (page, text) => {
      await page
        .getByText(text("settings.account.signedInAs", { username: "sebastian" }))
        .waitFor();
    },
  },
  {
    name: "settings-account-own-server",
    query: "view=main&section=account&server=dictation.example.com",
    act: async (page, text) => {
      await page
        .getByText(text("settings.account.server", { domain: "dictation.example.com" }))
        .waitFor();
    },
  },
  {
    name: "settings-listening",
    query: "view=main",
    act: async (page, text) => {
      await general(page);
      await page.getByRole("button", { name: text("settings.shortcut.change") }).click();
      await page.getByText(text("settings.shortcut.listening")).waitFor();
    },
  },
  {
    name: "settings-proposed",
    query: "view=main",
    act: async (page, text) => {
      await general(page);
      await pressShortcut(page, text);
      await page
        .getByRole("region", { name: text("settings.shortcut") })
        .getByRole("button", { name: text("common.save") })
        .waitFor();
    },
  },
  {
    name: "settings-error",
    query: "view=main&propose=altgr",
    act: async (page, text) => {
      await general(page);
      await pressShortcut(page, text);
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-autostart-error",
    query: "view=main&autostart-fails=1",
    act: async (page) => {
      await general(page);
      await page.getByRole("switch").click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary",
    query: "view=main&section=dictionary",
    act: async (page) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
    },
  },
  {
    name: "settings-dictionary-empty",
    query: "view=main&section=dictionary&data=empty",
    act: async (page, text) => {
      await page.getByText(text("dictionary.empty")).waitFor();
    },
  },
  {
    name: "settings-dictionary-add-word",
    query: "view=main&section=dictionary&focus=add",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByLabel(text("dictionary.term")).fill("Ñuñoa");
      await page.getByText(text("dictionary.advanced")).click();
      await page.getByLabel(text("dictionary.aliases")).fill("ñuñoa, nunoa");
    },
  },
  {
    name: "settings-dictionary-error",
    query: "view=main&section=dictionary",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByRole("button", { name: text("dictionary.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary-duplicate",
    query: "view=main&section=dictionary",
    act: async (page, text) => {
      await page.getByText("Kubernetes", { exact: true }).waitFor();
      await page.getByLabel(text("dictionary.term")).fill("kubernetes");
      await page.getByRole("button", { name: text("dictionary.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-dictionary-edit",
    query: "view=main&section=dictionary",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-dictionary-delete",
    query: "view=main&section=dictionary",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.delete") })
        .first()
        .click();
      await page.getByText(text("common.confirmDelete")).waitFor();
    },
  },
  {
    name: "settings-dictionary-loading",
    query: "view=main&section=dictionary&pending=listTerms",
  },
  {
    name: "settings-history-loading",
    query: "view=main&section=history&pending=listDictations",
  },
  {
    name: "onboarding-languages-loading",
    query: "view=main&state=new-user&styles=pending",
  },
  {
    name: "settings-dictionary-failed",
    query: "view=main&section=dictionary&fail=listTerms",
    act: async (page) => {
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-styles",
    query: "view=main&section=styles",
    act: async (page) => {
      await page.getByText("Correos a clientes").first().waitFor();
    },
  },
  {
    name: "settings-styles-empty",
    query: "view=main&section=styles&data=empty",
    act: async (page, text) => {
      await page.getByText(text("styles.customEmpty")).waitFor();
    },
  },
  {
    name: "settings-styles-saved",
    query: "view=main&section=styles",
    act: async (page, text) => {
      await page.getByRole("radio", { name: text("style.casual.name") }).check();
      await page.getByRole("button", { name: text("common.save") }).click();
      await page.getByText(text("common.saved")).waitFor();
    },
  },
  {
    name: "settings-styles-error",
    query: "view=main&section=styles",
    act: async (page, text) => {
      await page.getByLabel(text("styles.name")).fill("Notas rápidas");
      await page.getByRole("button", { name: text("styles.create") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-styles-edit",
    query: "view=main&section=styles",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-styles-delete",
    query: "view=main&section=styles",
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
    query: "view=main&section=appRules",
    act: async (page) => {
      await page.getByText("windowsterminal.exe", { exact: true }).waitFor();
    },
  },
  {
    name: "settings-app-rules-empty",
    query: "view=main&section=appRules&data=empty",
    act: async (page, text) => {
      await page.getByText(text("appRules.empty")).waitFor();
    },
  },
  {
    name: "settings-app-rules-duplicate",
    query: "view=main&section=appRules",
    act: async (page, text) => {
      await page.getByText("windowsterminal.exe", { exact: true }).waitFor();
      await page.getByLabel(text("appRules.app")).fill("Notepad.exe");
      await page.getByRole("button", { name: text("appRules.add") }).click();
      await page.getByRole("alert").waitFor();
    },
  },
  {
    name: "settings-app-rules-edit",
    query: "view=main&section=appRules",
    act: async (page, text) => {
      await page
        .getByRole("button", { name: text("common.edit") })
        .first()
        .click();
    },
  },
  {
    name: "settings-history",
    query: "view=main&section=history",
    act: async (page) => {
      await page.getByText("Compra pan y leche.").waitFor();
    },
  },
  {
    name: "settings-history-empty",
    query: "view=main&section=history&data=empty",
    act: async (page, text) => {
      await page.getByText(text("history.empty")).waitFor();
    },
  },
  {
    name: "settings-history-raw",
    query: "view=main&section=history",
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
    query: "view=main&section=history",
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
  { name: "overlay-hands-free", query: "view=overlay&overlay=hands-free" },
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
          if (view === "update") {
            const content = await page.evaluate(
              () => document.querySelector("main")?.getBoundingClientRect().height ?? 0,
            );
            await page.setViewportSize({
              width: size.width,
              height: Math.max(size.height, Math.ceil(content)),
            });
          }
          const overflow = await page.evaluate(() => ({
            sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            down: document.documentElement.scrollHeight > document.documentElement.clientHeight,
          }));
          if (overflow.sideways) {
            throw new Error(`${shot.name} scrolls sideways at ${String(size.width)} px`);
          }
          if (overflow.down && view !== "main") {
            throw new Error(`${shot.name} does not fit its ${String(size.height)} px window`);
          }
          const file = `${shot.name}-${language}-${String(size.width)}-${colorScheme}.png`;
          await page.screenshot({ path: join(out, file), fullPage: view === "main" });
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

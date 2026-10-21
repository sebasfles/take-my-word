import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";

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

interface Shot {
  name: string;
  query: string;
  act?: (page: Page) => Promise<void>;
}

const pressShortcut = async (page: Page) => {
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByText("Press the new shortcut").waitFor();
  await page.keyboard.down("Control");
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Control");
};

const shots: Shot[] = [
  { name: "first-run-ready", query: "view=first-run" },
  { name: "first-run-microphone-blocked", query: "view=first-run&mic=denied" },
  { name: "first-run-microphone-missing", query: "view=first-run&mic=missing" },
  { name: "settings-idle", query: "view=settings" },
  {
    name: "settings-listening",
    query: "view=settings",
    act: async (page) => {
      await page.getByRole("button", { name: "Change" }).click();
      await page.getByText("Press the new shortcut").waitFor();
    },
  },
  {
    name: "settings-proposed",
    query: "view=settings",
    act: async (page) => {
      await pressShortcut(page);
      await page.getByRole("button", { name: "Save" }).waitFor();
    },
  },
  {
    name: "settings-error",
    query: "view=settings&propose=altgr",
    act: async (page) => {
      await pressShortcut(page);
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
  { name: "overlay-listening", query: "view=overlay&overlay=listening" },
  { name: "overlay-processing", query: "view=overlay&overlay=processing" },
  { name: "overlay-error", query: "view=overlay&overlay=error" },
  { name: "overlay-error-microphone", query: "view=overlay&overlay=error-microphone" },
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
try {
  for (const colorScheme of ["dark", "light"] as const) {
    for (const size of widths) {
      if (colorScheme === "light" && size.width !== 1280) continue;
      const context = await browser.newContext({ viewport: size, colorScheme });
      for (const shot of shots) {
        const page = await context.newPage();
        await page.goto(`${base}?${shot.query}`);
        if (shot.query.includes("view=overlay")) {
          await page.addStyleTag({ content: "html, body { background: #52525b !important; }" });
          await page.locator(".pill").waitFor();
        } else {
          await page.getByRole("heading").first().waitFor();
        }
        await shot.act?.(page);
        await page.waitForTimeout(200);
        const file = `${shot.name}-${size.width}${colorScheme === "light" ? "-light" : ""}.png`;
        await page.screenshot({ path: join(out, file), fullPage: true });
        await page.close();
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`screenshots written to ${out}`);

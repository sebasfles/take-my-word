import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appIconSvg,
  appIconSizes,
  ico,
  png,
  traySizes,
  trayStates,
  traySvg,
} from "./desktop-icons.ts";

const icons = join(import.meta.dirname, "..", "..", "..", "apps", "desktop", "src-tauri", "icons");

for (const dev of [false, true]) {
  const dir = dev ? join(icons, "dev") : icons;
  rmSync(join(dir, "tray"), { recursive: true, force: true });
  mkdirSync(join(dir, "tray"), { recursive: true });
  const app = (px: number) => png(appIconSvg(px, dev), px);
  const files: [string, Buffer][] = [
    ["icon.ico", ico(appIconSizes.map((px) => ({ size: px, data: app(px) })))],
    ["32x32.png", app(32)],
    ["128x128.png", app(128)],
    ["128x128@2x.png", app(256)],
    ["icon.png", app(512)],
    ...trayStates.flatMap((state) =>
      traySizes.map((px): [string, Buffer] => [
        join("tray", `${state}-${String(px)}.png`),
        png(traySvg(state, px, dev), px),
      ]),
    ),
  ];
  for (const [name, content] of files) {
    writeFileSync(join(dir, name), content);
    process.stdout.write(`wrote ${join(dev ? "dev" : ".", name)}\n`);
  }
}

import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { staticAssets } from "../src/lib/static-assets.ts";

const root = join(import.meta.dirname, "..");
const from = join(root, "..", "..", "packages", "brand", "src", "assets");
const to = join(root, "public", "static");

mkdirSync(to, { recursive: true });
for (const file of readdirSync(to)) {
  if (!(staticAssets as readonly string[]).includes(file)) rmSync(join(to, file));
}
for (const file of staticAssets) copyFileSync(join(from, file), join(to, file));
process.stdout.write(`copied ${String(staticAssets.length)} brand assets to public/static\n`);

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tokensCss } from "../src/css.ts";
import { directions } from "../src/directions/index.ts";

const src = join(import.meta.dirname, "..", "src");

for (const direction of directions) {
  const path = join(src, "directions", direction.id, "tokens.css");
  writeFileSync(path, tokensCss(direction.tokens, `[data-direction="${direction.id}"]`));
  process.stdout.write(`wrote ${path}\n`);
}

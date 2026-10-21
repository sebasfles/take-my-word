import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tokensCss } from "../src/css.ts";
import { tokens } from "../src/tokens.ts";

writeFileSync(join(import.meta.dirname, "..", "src", "tokens.css"), tokensCss(tokens, ":root"));

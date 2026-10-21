import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const dist = join(root, "dist");
const functions = ["dictate", "authorizer", "api", "dictionary-usage"] as const;

rmSync(dist, { recursive: true, force: true });

for (const name of functions) {
  const outdir = join(dist, name);
  await build({
    entryPoints: [join(root, "src", name, "handler.ts")],
    outfile: join(outdir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    minify: true,
    keepNames: true,
    sourcemap: true,
    legalComments: "none",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  execFileSync("zip", [
    "-q",
    "-X",
    "-j",
    join(dist, `${name}.zip`),
    join(outdir, "index.mjs"),
    join(outdir, "index.mjs.map"),
  ]);
}

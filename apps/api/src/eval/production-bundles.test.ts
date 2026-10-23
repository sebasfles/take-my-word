import { join, relative } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const productionFunctions = ["dictate", "authorizer", "api", "dictionary-usage"] as const;

async function bundledInputs(name: string): Promise<string[]> {
  const result = await build({
    entryPoints: [join(root, "src", name, "handler.ts")],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return Object.keys(result.metafile.inputs).map((input) => relative(root, join(root, input)));
}

describe("production bundles", () => {
  it.each(productionFunctions)(
    "%s includes neither eval code nor its dependencies",
    async (name) => {
      const inputs = await bundledInputs(name);
      expect(inputs.some((input) => input.startsWith(join("src", name)))).toBe(true);
      expect(inputs.filter((input) => /(^|\/)(src\/eval|evaluation|undici)\//.test(input))).toEqual(
        [],
      );
    },
  );
});

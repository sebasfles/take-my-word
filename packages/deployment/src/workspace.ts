import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export const repositoryRoot = join(import.meta.dirname, "..", "..", "..");

export function readDotEnv(root: string): Record<string, string | undefined> {
  const path = join(root, ".env");
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

export function requiredEnv<const Name extends string>(
  names: readonly Name[],
  env: Record<string, string | undefined> = process.env,
): Record<Name, string> {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`missing ${missing.join(", ")}`);
  return Object.fromEntries(names.map((name) => [name, env[name] ?? ""])) as Record<Name, string>;
}

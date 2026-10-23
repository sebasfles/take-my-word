import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigError,
  loadConfig,
  repositoryRoot,
  type DeploymentConfig,
} from "@take-my-word/deployment";
import { discoverySchema, type Discovery } from "@take-my-word/shared";

export type Flavor = "dev" | "prd";

export interface BuildInputs {
  server: Discovery;
  updater: { pubkey: string; endpoints: string[] } | null;
}

type Env = Record<string, string | undefined>;

function fromConfig<T>(
  config: () => DeploymentConfig,
  pick: (config: DeploymentConfig) => T | undefined,
  what: string,
): T {
  let value: T | undefined;
  try {
    value = pick(config());
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    throw new ConfigError(`${what}: ${error.message}`);
  }
  if (value === undefined) throw new ConfigError(`${what}: deployment.json does not set it`);
  return value;
}

export function buildInputs(flavor: Flavor, env: Env, config: () => DeploymentConfig): BuildInputs {
  const serverJson = env.TAKE_MY_WORD_SERVER;
  const server = discoverySchema.parse(
    serverJson
      ? JSON.parse(serverJson)
      : fromConfig(
          config,
          (c) => c.desktop?.servers[flavor],
          `the ${flavor} server (TAKE_MY_WORD_SERVER or desktop.servers.${flavor})`,
        ),
  );
  if (flavor === "dev") return { server, updater: null };
  const pubkey =
    env.TAKE_MY_WORD_UPDATER_PUBKEY ||
    fromConfig(
      config,
      (c) => c.desktop?.updaterPublicKey,
      "the updater key (TAKE_MY_WORD_UPDATER_PUBKEY or desktop.updaterPublicKey)",
    );
  const repository =
    env.RELEASES_REPOSITORY ||
    fromConfig(
      config,
      (c) => c.releases,
      "the releases repository (RELEASES_REPOSITORY or releases)",
    );
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) {
    throw new ConfigError(
      `the releases repository is owner/name, not ${JSON.stringify(repository)}`,
    );
  }
  return {
    server,
    updater: {
      pubkey,
      endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
    },
  };
}

export function tauriOverlay(inputs: BuildInputs): object {
  return inputs.updater === null ? {} : { plugins: { updater: inputs.updater } };
}

function main(args: string[]): number {
  const [flavor, ...tauriArgs] = args;
  if ((flavor !== "dev" && flavor !== "prd") || tauriArgs.length === 0) {
    console.error("usage: node scripts/tauri.ts <dev|prd> <tauri args...>");
    return 2;
  }
  const inputs = buildInputs(flavor, process.env, () => loadConfig(repositoryRoot));
  const scratch = mkdtempSync(join(tmpdir(), "take-my-word-tauri-"));
  try {
    const overlay = join(scratch, "tauri.flavor.conf.json");
    writeFileSync(overlay, JSON.stringify(tauriOverlay(inputs)));
    const tauri = join(import.meta.dirname, "..", "node_modules", "@tauri-apps", "cli", "tauri.js");
    const result = spawnSync(
      process.execPath,
      [tauri, ...tauriArgs, "--config", `src-tauri/tauri.${flavor}.conf.json`, "--config", overlay],
      {
        cwd: join(import.meta.dirname, ".."),
        stdio: "inherit",
        env: { ...process.env, TAKE_MY_WORD_SERVER: JSON.stringify(inputs.server) },
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(`no build without the official server: ${error.message}`);
    process.exitCode = 2;
  }
}

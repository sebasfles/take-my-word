import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { verifyUpdaterSignature } from "./minisign.ts";

export const fixedInstallerName = "take-my-word-windows-x64-setup.exe";
export const windowsPlatform = "windows-x86_64";

interface Manifest {
  version?: unknown;
  notes?: unknown;
  platforms?: Record<string, { url?: unknown; signature?: unknown }>;
}

export interface ReleaseAsset {
  id: number;
  name: string;
}

export interface ReleaseCheck {
  dir: string;
  assets: ReleaseAsset[];
  publicKey: string;
  repo: string;
  version: string;
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function checkRelease({ dir, assets, publicKey, repo, version }: ReleaseCheck): string[] {
  const manifest = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")) as Manifest;
  if (manifest.version !== version) {
    throw new Error(`latest.json announces ${String(manifest.version)}, expected ${version}`);
  }
  if (typeof manifest.notes !== "string" || manifest.notes.trim() === "") {
    throw new Error("latest.json has no release notes");
  }
  const prefix = `https://api.github.com/repos/${repo}/releases/assets/`;
  const names = new Map(assets.map(({ id, name }) => [`${prefix}${String(id)}`, name]));
  const evidence: string[] = [`latest.json announces ${version}`];
  let installer: Buffer | undefined;
  const platforms = Object.entries(manifest.platforms ?? {});
  if (!platforms.some(([platform]) => platform === windowsPlatform)) {
    throw new Error(`latest.json has no ${windowsPlatform} entry`);
  }
  for (const [platform, entry] of platforms) {
    const { url, signature } = entry;
    const asset = typeof url === "string" ? names.get(url) : undefined;
    if (asset === undefined || /[\\/]/.test(asset)) {
      throw new Error(`${platform} points to ${String(url)}, which is no asset of this release`);
    }
    if (typeof signature !== "string") throw new Error(`${platform} has no signature`);
    const data = readFileSync(join(dir, asset));
    const signed = verifyUpdaterSignature(publicKey, signature, data);
    if (signed.version !== version) {
      throw new Error(`${asset} is signed for ${String(signed.version)}, expected ${version}`);
    }
    if (installer !== undefined && !installer.equals(data)) {
      throw new Error("the Windows entries point to different installers");
    }
    installer = data;
    evidence.push(`${platform}: ${asset} (sha256 ${sha256(data)}) verifies, signed for ${version}`);
  }
  const fixed = readFileSync(join(dir, fixedInstallerName));
  if (installer === undefined || !fixed.equals(installer)) {
    throw new Error(`${fixedInstallerName} differs from the signed installer`);
  }
  evidence.push(`${fixedInstallerName} matches the signed installer`);
  return evidence;
}

export function updaterPublicKey(configPath: string): string {
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    plugins?: { updater?: { pubkey?: unknown } };
  };
  const pubkey = config.plugins?.updater?.pubkey;
  if (typeof pubkey !== "string") throw new Error(`${configPath} has no updater pubkey`);
  return pubkey;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      dir: { type: "string" },
      config: { type: "string" },
      repo: { type: "string" },
      tag: { type: "string" },
      assets: { type: "string" },
    },
  });
  const { dir, config, repo, tag, assets } = values;
  if (!dir || !config || !repo || !assets || !tag?.startsWith("desktop-v")) {
    console.error(
      "usage: node scripts/release-check.ts --dir <downloads> --assets <assets.json> --config <tauri.prd.conf.json> --repo <owner/name> --tag desktop-vX.Y.Z",
    );
    process.exit(2);
  }
  const version = tag.slice("desktop-v".length);
  for (const line of checkRelease({
    dir,
    assets: JSON.parse(readFileSync(assets, "utf8")) as ReleaseAsset[],
    publicKey: updaterPublicKey(config),
    repo,
    version,
  })) {
    console.log(line);
  }
}

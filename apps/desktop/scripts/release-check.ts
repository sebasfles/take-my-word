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

export interface ReleaseCheck {
  dir: string;
  publicKey: string;
  repo: string;
  tag: string;
  version: string;
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function checkRelease({ dir, publicKey, repo, tag, version }: ReleaseCheck): string[] {
  const manifest = JSON.parse(readFileSync(join(dir, "latest.json"), "utf8")) as Manifest;
  if (manifest.version !== version) {
    throw new Error(`latest.json announces ${String(manifest.version)}, expected ${version}`);
  }
  if (typeof manifest.notes !== "string" || manifest.notes.trim() === "") {
    throw new Error("latest.json has no release notes");
  }
  const prefix = `https://github.com/${repo}/releases/download/${tag}/`;
  const evidence: string[] = [`latest.json announces ${version}`];
  let installer: Buffer | undefined;
  const platforms = Object.entries(manifest.platforms ?? {});
  if (!platforms.some(([platform]) => platform === windowsPlatform)) {
    throw new Error(`latest.json has no ${windowsPlatform} entry`);
  }
  for (const [platform, entry] of platforms) {
    const { url, signature } = entry;
    if (typeof url !== "string" || !url.startsWith(prefix)) {
      throw new Error(`${platform} points to ${String(url)}, outside ${prefix}`);
    }
    if (typeof signature !== "string") throw new Error(`${platform} has no signature`);
    const asset = decodeURIComponent(url.slice(prefix.length));
    if (asset === "" || /[\\/]/.test(asset)) throw new Error(`${platform} names no single asset`);
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
    },
  });
  const { dir, config, repo, tag } = values;
  if (!dir || !config || !repo || !tag?.startsWith("desktop-v")) {
    console.error(
      "usage: node scripts/release-check.ts --dir <assets> --config <tauri.prd.conf.json> --repo <owner/name> --tag desktop-vX.Y.Z",
    );
    process.exit(2);
  }
  const version = tag.slice("desktop-v".length);
  for (const line of checkRelease({
    dir,
    publicKey: updaterPublicKey(config),
    repo,
    tag,
    version,
  })) {
    console.log(line);
  }
}

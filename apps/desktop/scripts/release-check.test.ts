import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRelease, fixedInstallerName } from "./release-check.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const signerKey = readFileSync(join(fixtures, "signer.pub"), "utf8");
const otherKey = readFileSync(join(fixtures, "other.pub"), "utf8");
const signature = readFileSync(join(fixtures, "payload.bin.sig"), "utf8");
const repo = "sebasfles/take-my-word";
const asset = "Take.My.Word_1.2.3_x64-setup.exe";

let dir: string;

function manifest(changes: { version?: string; url?: string; signature?: string } = {}) {
  const entry = {
    url: changes.url ?? `https://github.com/${repo}/releases/download/desktop-v1.2.3/${asset}`,
    signature: changes.signature ?? signature,
  };
  writeFileSync(
    join(dir, "latest.json"),
    JSON.stringify({
      version: changes.version ?? "1.2.3",
      notes: "Fixes the paste in terminals.",
      platforms: { "windows-x86_64": entry, "windows-x86_64-nsis": entry },
    }),
  );
}

function check(version = "1.2.3", publicKey = signerKey) {
  return checkRelease({ dir, publicKey, repo, tag: `desktop-v${version}`, version });
}

describe("checkRelease", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "release-check-"));
    copyFileSync(join(fixtures, "payload.bin"), join(dir, asset));
    copyFileSync(join(fixtures, "payload.bin"), join(dir, fixedInstallerName));
    manifest();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts an installer signed by the committed key for the announced version", () => {
    const evidence = check();
    expect(evidence.filter((line) => line.includes("verifies, signed for 1.2.3"))).toHaveLength(2);
    expect(evidence.at(-1)).toBe(`${fixedInstallerName} matches the signed installer`);
  });

  it("rejects an installer changed after signing", () => {
    writeFileSync(join(dir, asset), "take my word update payload, patched\n");
    expect(() => check()).toThrow("the signature does not match the file");
  });

  it("rejects a signature from another key", () => {
    expect(() => check("1.2.3", otherKey)).toThrow("the signature was made with another key");
  });

  it("rejects a manifest that announces another version for the signed installer", () => {
    manifest({
      version: "1.2.4",
      url: `https://github.com/${repo}/releases/download/desktop-v1.2.4/${asset}`,
    });
    expect(() => check("1.2.4")).toThrow(`${asset} is signed for 1.2.3, expected 1.2.4`);
  });

  it("rejects a trusted comment edited to claim another version", () => {
    const text = Buffer.from(signature, "base64").toString("utf8");
    const forged = Buffer.from(text.replace("version:1.2.3", "version:1.2.4")).toString("base64");
    manifest({ signature: forged });
    expect(() => check()).toThrow("the trusted comment does not match its signature");
  });

  it("rejects an entry that points outside the release of the tag", () => {
    manifest({ url: `https://github.com/${repo}/releases/download/desktop-v1.2.2/${asset}` });
    expect(() => check()).toThrow("outside");
  });

  it("rejects a fixed-name installer that differs from the signed one", () => {
    writeFileSync(join(dir, fixedInstallerName), "something else\n");
    expect(() => check()).toThrow(`${fixedInstallerName} differs from the signed installer`);
  });
});

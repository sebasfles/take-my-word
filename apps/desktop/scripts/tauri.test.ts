import { ConfigError, parseConfig } from "@take-my-word/deployment";
import { describe, expect, it } from "vitest";
import { buildInputs, tauriOverlay } from "./tauri.ts";

const server = (name: string) => ({
  version: 1,
  apiUrl: `https://api.${name}.example.com`,
  region: "us-east-1",
  userPoolId: "us-east-1_Pool1",
  clientId: `${name}client`,
});

const config = parseConfig({
  aws: { profile: "me", accountId: "123456789012", region: "us-east-1" },
  domain: "dictation.example.com",
  releases: "owner/take-my-word",
  desktop: { updaterPublicKey: "config-key", servers: { dev: server("dev"), prd: server("prd") } },
});
const fromConfig = () => config;
const noConfig = () => {
  throw new ConfigError("deployment.json is missing");
};

describe("desktop build inputs", () => {
  it("builds dev against the configured dev server, with no updater", () => {
    expect(buildInputs("dev", {}, fromConfig)).toEqual({ server: server("dev"), updater: null });
  });

  it("builds prd with the updater on the releases of the configured repository", () => {
    expect(buildInputs("prd", {}, fromConfig)).toEqual({
      server: server("prd"),
      updater: {
        pubkey: "config-key",
        endpoints: ["https://github.com/owner/take-my-word/releases/latest/download/latest.json"],
      },
    });
  });

  it("takes everything from the environment in CI, with no deployment.json", () => {
    const env = {
      TAKE_MY_WORD_SERVER: JSON.stringify(server("ci")),
      TAKE_MY_WORD_UPDATER_PUBKEY: "ci-key",
      RELEASES_REPOSITORY: "fork/tmw",
    };
    expect(buildInputs("prd", env, noConfig)).toEqual({
      server: server("ci"),
      updater: {
        pubkey: "ci-key",
        endpoints: ["https://github.com/fork/tmw/releases/latest/download/latest.json"],
      },
    });
  });

  it("refuses to build without a server, a key or a repository", () => {
    expect(() => buildInputs("dev", {}, noConfig)).toThrow(
      /dev server.*deployment\.json is missing/,
    );
    const onlyServer = { TAKE_MY_WORD_SERVER: JSON.stringify(server("ci")) };
    expect(() => buildInputs("prd", onlyServer, noConfig)).toThrow(/updater key/);
    expect(() =>
      buildInputs("prd", { ...onlyServer, TAKE_MY_WORD_UPDATER_PUBKEY: "k" }, noConfig),
    ).toThrow(/releases repository/);
    expect(() =>
      buildInputs(
        "prd",
        { ...onlyServer, TAKE_MY_WORD_UPDATER_PUBKEY: "k", RELEASES_REPOSITORY: "a/b?c" },
        noConfig,
      ),
    ).toThrow(/owner\/name/);
  });

  it("refuses a server clients would refuse", () => {
    const env = { TAKE_MY_WORD_SERVER: JSON.stringify({ ...server("x"), region: "x.evil" }) };
    expect(() => buildInputs("dev", env, noConfig)).toThrow();
  });

  it("hands the prd build exactly the updater keys the Tauri plugin reads, and dev nothing", () => {
    expect(tauriOverlay(buildInputs("prd", {}, fromConfig))).toEqual({
      plugins: {
        updater: {
          pubkey: "config-key",
          endpoints: ["https://github.com/owner/take-my-word/releases/latest/download/latest.json"],
        },
      },
    });
    expect(tauriOverlay(buildInputs("dev", {}, fromConfig))).toEqual({});
  });
});

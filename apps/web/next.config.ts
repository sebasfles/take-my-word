import { join } from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = join(import.meta.dirname, "..", "..");
const buildEnv: Record<string, string> = { WEB_BUILT_AT: new Date().toISOString() };
for (const name of ["RELEASES_REPOSITORY", "WEB_INDEXED_ORIGIN"]) {
  const value = process.env[name];
  if (value !== undefined) buildEnv[name] = value;
}

const config: NextConfig = {
  transpilePackages: ["@take-my-word/shared", "@take-my-word/cognito", "@take-my-word/brand"],
  images: { unoptimized: true },
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  env: buildEnv,
  experimental: { globalNotFound: true },
};

export default config;

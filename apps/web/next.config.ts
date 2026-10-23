import { join } from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = join(import.meta.dirname, "..", "..");
const releasesRepository = process.env.RELEASES_REPOSITORY;

const config: NextConfig = {
  transpilePackages: ["@take-my-word/shared", "@take-my-word/cognito", "@take-my-word/brand"],
  images: { unoptimized: true },
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  ...(releasesRepository === undefined ? {} : { env: { RELEASES_REPOSITORY: releasesRepository } }),
};

export default config;

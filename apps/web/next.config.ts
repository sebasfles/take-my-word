import { join } from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = join(import.meta.dirname, "..", "..");

const config: NextConfig = {
  transpilePackages: ["@take-my-word/shared", "@take-my-word/cognito"],
  images: { unoptimized: true },
  poweredByHeader: false,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};

export default config;

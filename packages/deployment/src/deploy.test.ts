import { describe, expect, it } from "vitest";
import { apiBuildSteps, apiSwapSteps, webBuildSteps, webSwapSteps, type Step } from "./deploy.ts";

const root = "/repo";
const zip = "/repo/apps/web/.open-next/server-function.zip";

function line(step: Step): string {
  return [step.command, ...step.args].join(" ");
}

const touchesAws = (steps: Step[]) => steps.some((step) => step.command === "aws");
const builds = (steps: Step[]) =>
  steps.some((step) => step.command === "pnpm" || step.command === "zip");

describe("api deploy", () => {
  it("builds with no AWS call, so CI can build before it assumes the deploy role", () => {
    const steps = apiBuildSteps(root);
    expect(steps.map(line)).toEqual(["pnpm --filter @take-my-word/api build"]);
    expect(touchesAws(steps)).toBe(false);
  });

  it("swaps each built bundle and waits for it, authorizer first, building nothing", () => {
    const steps = apiSwapSteps(root, {
      AUTHORIZER_FUNCTION_NAME: "x-authorizer",
      DICTATE_FUNCTION_NAME: "x-dictate",
      API_FUNCTION_NAME: "x-api",
      DICTIONARY_USAGE_FUNCTION_NAME: "x-dictionary-usage",
    });
    expect(builds(steps)).toBe(false);
    expect(steps.map(line)).toEqual(
      ["authorizer", "dictate", "api", "dictionary-usage"].flatMap((name) => [
        `aws lambda update-function-code --function-name x-${name} --zip-file fileb:///repo/apps/api/dist/${name}.zip --query [FunctionName,CodeSha256] --output text --no-cli-pager`,
        `aws lambda wait function-updated-v2 --function-name x-${name}`,
      ]),
    );
  });
});

describe("web deploy", () => {
  const build = webBuildSteps(root, { releasesRepository: "owner/take-my-word" });
  const swap = webSwapSteps(root, {
    WEB_FUNCTION_NAME: "x-web",
    WEB_ASSETS_BUCKET: "x-assets",
    WEB_DISTRIBUTION_ID: "E123",
  });
  const lines = swap.map(line);
  const index = (fragment: string) => lines.findIndex((text) => text.includes(fragment));

  it("builds and zips with no AWS call, with the releases repository the links point at", () => {
    expect(touchesAws(build)).toBe(false);
    expect(build[0]?.env).toEqual({
      RELEASES_REPOSITORY: "owner/take-my-word",
      WEB_INDEXED_ORIGIN: "",
    });
    expect(build.map(line)).toContain(`zip -qry ${zip} .`);
  });

  it("builds an indexed web only for the origin it is given", () => {
    const indexed = webBuildSteps(root, {
      releasesRepository: "owner/take-my-word",
      indexedOrigin: "https://dictation.example.com",
    });
    expect(indexed[0]?.env?.WEB_INDEXED_ORIGIN).toBe("https://dictation.example.com");
  });

  it("swaps the zip the build left, building nothing", () => {
    expect(builds(swap)).toBe(false);
    expect(lines).toContain(
      `aws lambda update-function-code --function-name x-web --zip-file fileb://${zip} --query [FunctionName,CodeSha256] --output text --no-cli-pager`,
    );
  });

  it("uploads the immutable chunks before the code swap, the rest after, then invalidates", () => {
    const immutable = index("--include _next/static/*");
    const swapCode = index("update-function-code --function-name x-web");
    const wait = index("wait function-updated-v2 --function-name x-web");
    const rest = index("--exclude _next/static/*");
    const invalidate = index("create-invalidation --distribution-id E123 --paths /*");
    expect(immutable).toBe(0);
    expect(immutable).toBeLessThan(swapCode);
    expect(swapCode).toBeLessThan(wait);
    expect(wait).toBeLessThan(rest);
    expect(rest).toBeLessThan(invalidate);
    expect(invalidate).toBe(lines.length - 1);
  });

  it("never deletes assets an open page may still load", () => {
    expect(lines.some((text) => text.includes("--delete"))).toBe(false);
    expect(lines[index("--include _next/static/*")]).toContain("public,max-age=31536000,immutable");
  });
});

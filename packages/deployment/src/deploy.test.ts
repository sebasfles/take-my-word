import { describe, expect, it } from "vitest";
import { apiDeploySteps, webDeploySteps, type Step } from "./deploy.ts";

const root = "/repo";

function line(step: Step): string {
  return [step.command, ...step.args].join(" ");
}

describe("api deploy", () => {
  it("builds once, then swaps each function's code and waits for it, authorizer first", () => {
    const steps = apiDeploySteps(root, {
      AUTHORIZER_FUNCTION_NAME: "x-authorizer",
      DICTATE_FUNCTION_NAME: "x-dictate",
      API_FUNCTION_NAME: "x-api",
      DICTIONARY_USAGE_FUNCTION_NAME: "x-dictionary-usage",
    });
    expect(steps.map(line)).toEqual([
      "pnpm --filter @take-my-word/api build",
      ...["authorizer", "dictate", "api", "dictionary-usage"].flatMap((name) => [
        `aws lambda update-function-code --function-name x-${name} --zip-file fileb:///repo/apps/api/dist/${name}.zip --query [FunctionName,CodeSha256] --output text --no-cli-pager`,
        `aws lambda wait function-updated-v2 --function-name x-${name}`,
      ]),
    ]);
  });
});

describe("web deploy", () => {
  const steps = webDeploySteps(
    root,
    {
      WEB_FUNCTION_NAME: "x-web",
      WEB_ASSETS_BUCKET: "x-assets",
      WEB_DISTRIBUTION_ID: "E123",
      RELEASES_REPOSITORY: "owner/take-my-word",
    },
    "/tmp/s",
  );
  const lines = steps.map(line);
  const index = (fragment: string) => lines.findIndex((text) => text.includes(fragment));

  it("builds with the releases repository the links point at", () => {
    expect(steps[0]?.env).toEqual({ RELEASES_REPOSITORY: "owner/take-my-word" });
  });

  it("keeps pnpm's symlinks in the server zip", () => {
    expect(lines).toContain("zip -qry /tmp/s/web.zip .");
  });

  it("uploads the immutable chunks before the code swap, the rest after, then invalidates", () => {
    const immutable = index("--include _next/static/*");
    const swap = index("update-function-code --function-name x-web");
    const wait = index("wait function-updated-v2 --function-name x-web");
    const rest = index("--exclude _next/static/*");
    const invalidate = index("create-invalidation --distribution-id E123 --paths /*");
    expect([immutable, swap, wait, rest, invalidate].every((i) => i > 0)).toBe(true);
    expect(immutable).toBeLessThan(swap);
    expect(swap).toBeLessThan(wait);
    expect(wait).toBeLessThan(rest);
    expect(rest).toBeLessThan(invalidate);
    expect(invalidate).toBe(lines.length - 1);
  });

  it("never deletes assets an open page may still load", () => {
    expect(lines.some((text) => text.includes("--delete"))).toBe(false);
    expect(lines[index("--include _next/static/*")]).toContain("public,max-age=31536000,immutable");
  });
});

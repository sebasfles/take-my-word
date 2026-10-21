import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { contractPath, contractSchemas } from "./schemas.ts";

test("the committed contract matches packages/shared; run pnpm contract after changing it", () => {
  const committed: unknown = JSON.parse(readFileSync(contractPath, "utf8"));
  expect(committed).toEqual(contractSchemas());
});

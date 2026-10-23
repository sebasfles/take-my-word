import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { deploymentConfigSchema } from "./config.ts";
import { repositoryRoot } from "./workspace.ts";

export const schemaPath = join(repositoryRoot, "deployment.schema.json");
export const examplePath = join(repositoryRoot, "deployment.example.json");

export function configJsonSchema(): unknown {
  return z.toJSONSchema(deploymentConfigSchema, { io: "input" });
}

if (import.meta.main) {
  writeFileSync(schemaPath, `${JSON.stringify(configJsonSchema(), null, 2)}\n`);
}

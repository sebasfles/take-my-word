import { writeFileSync } from "node:fs";
import { contractPath, contractSchemas } from "./schemas.ts";

writeFileSync(contractPath, `${JSON.stringify(contractSchemas(), null, 2)}\n`);

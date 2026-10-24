import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chainedTranscribers } from "./harness/candidates.ts";
import { chainedCases } from "./harness/chained.ts";
import {
  chainedChecksPath,
  chainedChecksSchema,
  chainedFixturesPath,
} from "./harness/cleanup-fixtures.ts";
import { loadTranscriptionFixtures } from "./harness/fixtures.ts";
import { readJsonl } from "./harness/store.ts";
import type { TranscriptionResult } from "./harness/transcription-analysis.ts";
import { fromInvocation, fromRoot } from "./harness/workspace.ts";

const { values } = parseArgs({ options: { transcription: { type: "string" } } });
if (values.transcription === undefined) {
  console.error("usage: pnpm eval:chain --transcription <transcription results dir>");
  process.exit(2);
}
const results = readJsonl<TranscriptionResult>(
  join(fromInvocation(values.transcription), "transcription.jsonl"),
);
const checks = chainedChecksSchema.parse(JSON.parse(readFileSync(chainedChecksPath, "utf8")));
const cases = chainedCases(loadTranscriptionFixtures(), results, chainedTranscribers, checks);
writeFileSync(chainedFixturesPath, `${JSON.stringify({ cases }, null, 2)}\n`);
console.log(`${String(cases.length)} chained cases written to ${fromRoot(chainedFixturesPath)}`);

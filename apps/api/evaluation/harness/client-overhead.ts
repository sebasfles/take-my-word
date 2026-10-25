export const clientOverhead = {
  run: "end-to-end-1",
  measuredAt: "2026-10-24T04:21:19.043Z",
  source: "docs/tasks/0017_eval_harness/reports/end-to-end-1.md",
  meaning:
    "per warm dictation through the dev API, release to text on the client minus dictate's own total, plus that dictation's storage stages (the larger of the quota and profile reads, and the save), which the eval Lambda fakes: the client's network to us-east-1, API Gateway, the authorizer, the Lambda invoke and DynamoDB",
  samplesMs: [
    1643, 498, 469, 604, 798, 661, 885, 836, 750, 525, 487, 487, 494, 486, 483, 493, 484, 844, 720,
    474, 629, 602, 633, 624, 631, 615, 628, 938, 848, 621,
  ],
} as const;

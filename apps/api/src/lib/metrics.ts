import type { LineWriter } from "./log.ts";

export const metricsNamespace = "TakeMyWord/Dictation";

export interface ProviderCall {
  provider: string;
  latencyMs: number;
  failed: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export type Metrics = (call: ProviderCall) => void;

export function createMetrics(write: LineWriter, now: () => number = Date.now): Metrics {
  return (call) => {
    const values: Record<string, number> = {
      Latency: call.latencyMs,
      Errors: call.failed ? 1 : 0,
    };
    if (call.inputTokens !== undefined) values.InputTokens = call.inputTokens;
    if (call.outputTokens !== undefined) values.OutputTokens = call.outputTokens;
    const units: Record<string, string> = {
      Latency: "Milliseconds",
      Errors: "Count",
      InputTokens: "Count",
      OutputTokens: "Count",
    };
    write(
      JSON.stringify({
        _aws: {
          Timestamp: now(),
          CloudWatchMetrics: [
            {
              Namespace: metricsNamespace,
              Dimensions: [["Provider"]],
              Metrics: Object.keys(values).map((name) => ({ Name: name, Unit: units[name] })),
            },
          ],
        },
        Provider: call.provider,
        ...values,
      }),
    );
  };
}

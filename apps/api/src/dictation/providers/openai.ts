import { z } from "zod";
import { ProviderError } from "../ports/provider-error.ts";
import type { RefineInput, Refiner } from "../ports/refiner.ts";
import { postForJson, type HttpOptions } from "./http.ts";

export const openaiId = "openai";
export const defaultOpenaiModel = "gpt-5.4-nano";
const defaultTimeoutMs = 15_000;

const endpoint = "https://api.openai.com/v1/responses";

const responseSchema = z.object({
  status: z.string(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
    }),
  ),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

export interface OpenaiOptions extends HttpOptions {
  apiKey: () => Promise<string>;
  model?: string;
  reasoningEffort?: string;
  temperature?: number;
}

export function openaiRefiner({
  apiKey,
  model = defaultOpenaiModel,
  reasoningEffort,
  temperature,
  ...http
}: OpenaiOptions): Refiner {
  const label = `${openaiId}:${model}`;
  return {
    label,
    async refine({ raw, instructions }: RefineInput) {
      const body = await postForJson(
        label,
        endpoint,
        {
          headers: {
            authorization: `Bearer ${await apiKey()}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            instructions,
            input: raw,
            store: false,
            ...(reasoningEffort !== undefined && { reasoning: { effort: reasoningEffort } }),
            ...(temperature !== undefined && { temperature }),
          }),
        },
        { timeoutMs: defaultTimeoutMs, ...http },
      );
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(label, `${label} answered an unexpected shape`);
      if (parsed.data.status !== "completed") {
        throw new ProviderError(label, `${label} finished with status ${parsed.data.status}`);
      }
      const text = parsed.data.output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      return {
        text,
        usage: {
          inputTokens: parsed.data.usage.input_tokens,
          outputTokens: parsed.data.usage.output_tokens,
        },
      };
    },
  };
}

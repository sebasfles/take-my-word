import { z } from "zod";
import { ProviderError } from "../ports/provider-error.ts";
import type { RefineInput, Refiner } from "../ports/refiner.ts";
import { postForJson, type HttpOptions } from "./http.ts";

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
});

export interface ChatCompletionsOptions extends HttpOptions {
  apiKey: () => Promise<string>;
  model: string;
  reasoningEffort?: string;
  temperature?: number;
}

export interface ChatCompletionsProvider {
  id: string;
  endpoint: string;
  timeoutMs: number;
}

export function chatCompletionsRefiner(
  { id, endpoint, timeoutMs }: ChatCompletionsProvider,
  { apiKey, model, reasoningEffort, temperature, ...http }: ChatCompletionsOptions,
): Refiner {
  const label = `${id}:${model}`;
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
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: raw },
            ],
            ...(reasoningEffort !== undefined && { reasoning_effort: reasoningEffort }),
            ...(temperature !== undefined && { temperature }),
          }),
        },
        { timeoutMs, ...http },
      );
      const parsed = responseSchema.safeParse(body);
      if (!parsed.success) throw new ProviderError(label, `${label} answered an unexpected shape`);
      const [choice] = parsed.data.choices;
      if (choice?.finish_reason !== "stop") {
        throw new ProviderError(label, `${label} finished with ${choice?.finish_reason ?? "none"}`);
      }
      return {
        text: (choice.message.content ?? "").trim(),
        usage: {
          inputTokens: parsed.data.usage.prompt_tokens,
          outputTokens: parsed.data.usage.completion_tokens,
        },
      };
    },
  };
}

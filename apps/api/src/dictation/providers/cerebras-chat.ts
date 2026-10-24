import type { Refiner } from "../ports/refiner.ts";
import { chatCompletionsRefiner, type ChatCompletionsOptions } from "./chat-completions.ts";

export const cerebrasChatId = "cerebras-chat";

export type CerebrasChatOptions = ChatCompletionsOptions;

export function cerebrasChatRefiner(options: CerebrasChatOptions): Refiner {
  return chatCompletionsRefiner(
    {
      id: cerebrasChatId,
      endpoint: "https://api.cerebras.ai/v1/chat/completions",
      timeoutMs: 10_000,
    },
    options,
  );
}

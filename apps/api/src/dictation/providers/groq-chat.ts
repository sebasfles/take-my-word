import type { Refiner } from "../ports/refiner.ts";
import { chatCompletionsRefiner, type ChatCompletionsOptions } from "./chat-completions.ts";

export const groqChatId = "groq-chat";

export type GroqChatOptions = ChatCompletionsOptions;

export function groqChatRefiner(options: GroqChatOptions): Refiner {
  return chatCompletionsRefiner(
    {
      id: groqChatId,
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      timeoutMs: 10_000,
    },
    options,
  );
}

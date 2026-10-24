import type { Refiner } from "../dictation/ports/refiner.ts";
import type { Transcriber } from "../dictation/ports/transcriber.ts";
import { cerebrasChatRefiner } from "../dictation/providers/cerebras-chat.ts";
import { groqChatRefiner } from "../dictation/providers/groq-chat.ts";
import { groqWhisper } from "../dictation/providers/groq-whisper.ts";
import type { Fetch } from "../dictation/providers/http.ts";
import { openaiTranscriber } from "../dictation/providers/openai-transcribe.ts";
import { openaiRefiner } from "../dictation/providers/openai.ts";
import { togetherTranscriber } from "../dictation/providers/together-transcribe.ts";
import type { RefinerSpec, TranscriberSpec } from "./contract.ts";
import type { EvalKeys } from "./keys.ts";

type Keys = () => Promise<EvalKeys>;
const key = (keys: Keys, name: keyof EvalKeys) => async () => (await keys())[name];

export function buildTranscriber(spec: TranscriberSpec, keys: Keys, fetch: Fetch): Transcriber {
  switch (spec.provider) {
    case "groq-whisper":
      return groqWhisper({ apiKey: key(keys, "GROQ_API_KEY"), model: spec.model, fetch });
    case "openai-transcribe":
      return openaiTranscriber({
        apiKey: key(keys, "OPENAI_API_KEY"),
        model: spec.model,
        ...(spec.languageField && { languageField: spec.languageField }),
        fetch,
      });
    case "together-transcribe":
      return togetherTranscriber({
        apiKey: key(keys, "TOGETHER_API_KEY"),
        model: spec.model,
        prompted: spec.prompted ?? false,
        fetch,
      });
  }
}

export function buildRefiner(spec: RefinerSpec, keys: Keys, fetch: Fetch): Refiner {
  const tuning = {
    model: spec.model,
    ...(spec.reasoningEffort !== undefined && { reasoningEffort: spec.reasoningEffort }),
    ...(spec.temperature !== undefined && { temperature: spec.temperature }),
    fetch,
  };
  switch (spec.provider) {
    case "openai":
      return openaiRefiner({ apiKey: key(keys, "OPENAI_API_KEY"), ...tuning });
    case "groq-chat":
      return groqChatRefiner({ apiKey: key(keys, "GROQ_API_KEY"), ...tuning });
    case "cerebras-chat":
      return cerebrasChatRefiner({ apiKey: key(keys, "CEREBRAS_API_KEY"), ...tuning });
  }
}

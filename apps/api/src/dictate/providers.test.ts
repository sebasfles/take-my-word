import { describe, expect, it } from "vitest";
import { createLogger } from "../lib/log.ts";
import type { ProviderKeys } from "../lib/secrets.ts";
import { selectProviders } from "./providers.ts";

const allKeys: ProviderKeys = {
  GROQ_API_KEY: "g",
  OPENAI_API_KEY: "o",
  TOGETHER_API_KEY: "t",
  CEREBRAS_API_KEY: "c",
};

function select(choice: { TRANSCRIBER: string; REFINER: string }, keys: ProviderKeys = allKeys) {
  const lines: string[] = [];
  let reads = 0;
  const selected = selectProviders(
    choice,
    () => {
      reads += 1;
      return Promise.resolve(keys);
    },
    createLogger({ function: "dictate" }, (line) => lines.push(line)),
  );
  return {
    selected,
    lines: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    reads: () => reads,
  };
}

const today = { TRANSCRIBER: "whisper-large-v3-turbo", REFINER: "gpt-5.4-nano" };

describe("selectProviders", () => {
  it("builds today's pair under today's labels from Groq's and OpenAI's keys alone", async () => {
    const { selected, lines } = select(today, { GROQ_API_KEY: "g", OPENAI_API_KEY: "o" });
    const { transcriber, refiner } = await selected;
    expect(transcriber.label).toBe("groq-whisper:whisper-large-v3-turbo");
    expect(refiner.label).toBe("openai:gpt-5.4-nano");
    expect(lines()).toEqual([]);
  });

  it.each([
    [
      { TRANSCRIBER: "gpt-transcribe", REFINER: "gpt-5.4-nano" },
      "openai-transcribe:gpt-transcribe",
      "openai:gpt-5.4-nano",
    ],
    [
      { TRANSCRIBER: "together-parakeet", REFINER: "cerebras-qwen-3.8-27b@none" },
      "together-transcribe:nvidia/parakeet-tdt-0.6b-v3",
      "cerebras-chat:qwen-3.8-27b@none",
    ],
    [
      { TRANSCRIBER: "whisper-large-v3-turbo", REFINER: "gpt-oss-20b@low" },
      "groq-whisper:whisper-large-v3-turbo",
      "groq-chat:openai/gpt-oss-20b@low",
    ],
  ])("builds the pair %j", async (choice, transcriber, refiner) => {
    const selected = await select(choice).selected;
    expect(selected.transcriber.label).toBe(transcriber);
    expect(selected.refiner.label).toBe(refiner);
  });

  it.each([
    [
      { ...today, TRANSCRIBER: "groq-whisper" },
      /^TRANSCRIBER is "groq-whisper", which is none of /,
    ],
    [{ ...today, REFINER: "" }, /^REFINER is "", which is none of /],
  ])(
    "fails on an unknown id with one error line, before reading any key: %j",
    async (choice, reason) => {
      const { selected, lines, reads } = select(choice);
      await expect(selected).rejects.toThrow(reason);
      expect(reads()).toBe(0);
      expect(lines()).toEqual([
        expect.objectContaining({
          level: "error",
          message: "providers not selected",
          function: "dictate",
          reason: expect.stringMatching(reason) as unknown,
        }),
      ]);
    },
  );

  it("fails naming every missing key of the selected pair in one error line", async () => {
    const { selected, lines } = select(
      { TRANSCRIBER: "together-parakeet", REFINER: "cerebras-gpt-oss-120b@low" },
      { GROQ_API_KEY: "g", OPENAI_API_KEY: "o", TOGETHER_API_KEY: "" },
    );
    await expect(selected).rejects.toThrow(
      "The providers secret has no value for TOGETHER_API_KEY and CEREBRAS_API_KEY.",
    );
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      transcriber: "together-parakeet",
      refiner: "cerebras-gpt-oss-120b@low",
      reason: "The providers secret has no value for TOGETHER_API_KEY and CEREBRAS_API_KEY.",
    });
  });
});

import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const voices = {
  es: { VoiceId: "Lupe", LanguageCode: "es-US" },
  en: { VoiceId: "Joanna", LanguageCode: "en-US" },
} as const;

export async function synthesize(
  text: string,
  language: keyof typeof voices = "es",
): Promise<Buffer> {
  const polly = new PollyClient({ region: "us-east-1" });
  const { AudioStream } = await polly.send(
    new SynthesizeSpeechCommand({
      Engine: "neural",
      ...voices[language],
      OutputFormat: "pcm",
      SampleRate: "16000",
      Text: text,
    }),
  );
  if (!AudioStream) throw new Error("Polly returned no audio");
  return pcmToWav(Buffer.from(await AudioStream.transformToByteArray()));
}

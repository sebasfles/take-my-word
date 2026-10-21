import { InvalidAudioError } from "./invalid-audio.ts";

const pcm = 1;
const extensible = 0xfffe;
const sampleRate = 16_000;
const channels = 1;
const bitsPerSample = 16;
const byteRate = sampleRate * channels * (bitsPerSample / 8);

export function wavSeconds(bytes: Buffer): number {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF") {
    throw new InvalidAudioError("not a RIFF file");
  }
  if (bytes.toString("ascii", 8, 12) !== "WAVE") throw new InvalidAudioError("not a WAVE file");

  let format: number | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) throw new InvalidAudioError("short fmt chunk");
      format = bytes.readUInt16LE(body);
      if (format !== pcm && format !== extensible) throw new InvalidAudioError("WAV is not PCM");
      const layout = {
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        byteRate: bytes.readUInt32LE(body + 8),
        bitsPerSample: bytes.readUInt16LE(body + 14),
      };
      if (
        layout.channels !== channels ||
        layout.sampleRate !== sampleRate ||
        layout.byteRate !== byteRate ||
        layout.bitsPerSample !== bitsPerSample
      ) {
        throw new InvalidAudioError("WAV is not 16 kHz mono 16-bit");
      }
    } else if (id === "data") {
      if (format === undefined) throw new InvalidAudioError("data chunk before fmt chunk");
      return (bytes.length - body) / byteRate;
    }
    offset = body + size + (size % 2);
  }
  throw new InvalidAudioError("no data chunk");
}

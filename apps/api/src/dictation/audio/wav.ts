import { InvalidAudioError } from "./invalid-audio.ts";

const pcm = 1;
const extensible = 0xfffe;

export function wavDurationSeconds(bytes: Buffer): number {
  if (bytes.length < 12 || bytes.toString("ascii", 0, 4) !== "RIFF") {
    throw new InvalidAudioError("not a RIFF file");
  }
  if (bytes.toString("ascii", 8, 12) !== "WAVE") throw new InvalidAudioError("not a WAVE file");

  let byteRate: number | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) throw new InvalidAudioError("short fmt chunk");
      const format = bytes.readUInt16LE(body);
      const sampleRate = bytes.readUInt32LE(body + 4);
      const declaredByteRate = bytes.readUInt32LE(body + 8);
      const blockAlign = bytes.readUInt16LE(body + 12);
      if (format !== pcm && format !== extensible) throw new InvalidAudioError("WAV is not PCM");
      if (sampleRate === 0 || blockAlign === 0 || declaredByteRate !== sampleRate * blockAlign) {
        throw new InvalidAudioError("inconsistent fmt chunk");
      }
      byteRate = declaredByteRate;
    } else if (id === "data") {
      if (byteRate === undefined) throw new InvalidAudioError("data chunk before fmt chunk");
      const available = bytes.length - body;
      return Math.min(size, available) / byteRate;
    }
    offset = body + size + (size % 2);
  }
  throw new InvalidAudioError("no data chunk");
}

import { InvalidAudioError } from "./invalid-audio.ts";

const unknownDuration32 = 0xffffffff;

interface Box {
  type: string;
  start: number;
  end: number;
}

function* boxes(bytes: Buffer, start: number, end: number): Generator<Box> {
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new InvalidAudioError("truncated box header");
      size = Number(bytes.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) throw new InvalidAudioError(`box ${type} overflows`);
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

function child(bytes: Buffer, parent: Box | undefined, type: string): Box | undefined {
  if (!parent) return undefined;
  for (const box of boxes(bytes, parent.start, parent.end)) if (box.type === type) return box;
  return undefined;
}

function movieHeader(bytes: Buffer, mvhd: Box): { timescale: number; duration: number } {
  const version = bytes.readUInt8(mvhd.start);
  const needed = version === 1 ? 32 : 20;
  if (mvhd.start + needed > mvhd.end) throw new InvalidAudioError("short mvhd box");
  if (version === 1) {
    return {
      timescale: bytes.readUInt32BE(mvhd.start + 20),
      duration: Number(bytes.readBigUInt64BE(mvhd.start + 24)),
    };
  }
  return {
    timescale: bytes.readUInt32BE(mvhd.start + 12),
    duration: bytes.readUInt32BE(mvhd.start + 16),
  };
}

function fragmentDuration(bytes: Buffer, mehd: Box | undefined): number {
  if (!mehd) return 0;
  const version = bytes.readUInt8(mehd.start);
  if (mehd.start + (version === 1 ? 12 : 8) > mehd.end)
    throw new InvalidAudioError("short mehd box");
  return version === 1
    ? Number(bytes.readBigUInt64BE(mehd.start + 4))
    : bytes.readUInt32BE(mehd.start + 4);
}

export function m4aDurationSeconds(bytes: Buffer): number {
  const top = [...boxes(bytes, 0, bytes.length)];
  if (top[0]?.type !== "ftyp") throw new InvalidAudioError("not an MP4 container");
  const moov = top.find((box) => box.type === "moov");
  const mvhd = child(bytes, moov, "mvhd");
  if (!mvhd) throw new InvalidAudioError("no movie header");
  const { timescale, duration } = movieHeader(bytes, mvhd);
  if (timescale === 0) throw new InvalidAudioError("zero timescale");
  const known = duration > 0 && duration !== unknownDuration32;
  const units = known
    ? duration
    : fragmentDuration(bytes, child(bytes, child(bytes, moov, "mvex"), "mehd"));
  if (units === 0) throw new InvalidAudioError("unknown duration");
  return units / timescale;
}

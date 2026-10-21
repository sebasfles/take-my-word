export function wav({
  seconds,
  sampleRate = 16_000,
  channels = 1,
  bitsPerSample = 16,
  extraChunk = false,
}: {
  seconds: number;
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  extraChunk?: boolean;
}): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = Math.round(seconds * sampleRate) * blockAlign;
  const list = extraChunk
    ? Buffer.concat([Buffer.from("LIST"), u32le(3), Buffer.from("abc\0")])
    : Buffer.alloc(0);
  const fmt = Buffer.alloc(24);
  fmt.write("fmt ", 0, "ascii");
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(sampleRate, 12);
  fmt.writeUInt32LE(sampleRate * blockAlign, 16);
  fmt.writeUInt16LE(blockAlign, 20);
  fmt.writeUInt16LE(bitsPerSample, 22);
  const data = Buffer.concat([Buffer.from("data"), u32le(dataSize), Buffer.alloc(dataSize)]);
  const body = Buffer.concat([Buffer.from("WAVE"), fmt, list, data]);
  return Buffer.concat([Buffer.from("RIFF"), u32le(body.length), body]);
}

function u32le(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function box(type: string, ...children: Buffer[]): Buffer {
  const body = Buffer.concat(children);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(body.length + 8);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, body]);
}

function mvhdV0(timescale: number, duration: number): Buffer {
  const body = Buffer.alloc(100);
  body.writeUInt32BE(timescale, 12);
  body.writeUInt32BE(duration, 16);
  return box("mvhd", body);
}

function mvhdV1(timescale: number, duration: number): Buffer {
  const body = Buffer.alloc(112);
  body.writeUInt8(1, 0);
  body.writeUInt32BE(timescale, 20);
  body.writeBigUInt64BE(BigInt(duration), 24);
  return box("mvhd", body);
}

function mehd(duration: number): Buffer {
  const body = Buffer.alloc(8);
  body.writeUInt32BE(duration, 4);
  return box("mehd", body);
}

export function m4a({
  seconds,
  timescale = 44_100,
  version = 0,
  fragmented = false,
  moovFirst = false,
}: {
  seconds: number;
  timescale?: number;
  version?: 0 | 1;
  fragmented?: boolean;
  moovFirst?: boolean;
}): Buffer {
  const units = Math.round(seconds * timescale);
  const header =
    version === 1 ? mvhdV1(timescale, units) : mvhdV0(timescale, fragmented ? 0 : units);
  const moov = fragmented ? box("moov", header, box("mvex", mehd(units))) : box("moov", header);
  const ftyp = box("ftyp", Buffer.from("M4A \0\0\0\0M4A isom"));
  const mdat = box("mdat", Buffer.alloc(32));
  return moovFirst ? Buffer.concat([ftyp, moov, mdat]) : Buffer.concat([ftyp, mdat, moov]);
}

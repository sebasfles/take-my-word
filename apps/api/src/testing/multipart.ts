export interface Part {
  name: string;
  body: Buffer | string;
  filename?: string;
  contentType?: string;
}

export const boundary = "----take-my-word-test";
export const multipartContentType = `multipart/form-data; boundary=${boundary}`;

export function multipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      part.filename === undefined
        ? `form-data; name="${part.name}"`
        : `form-data; name="${part.name}"; filename="${part.filename}"`;
    const headers = [`Content-Disposition: ${disposition}`];
    if (part.contentType !== undefined) headers.push(`Content-Type: ${part.contentType}`);
    chunks.push(Buffer.from(`--${boundary}\r\n${headers.join("\r\n")}\r\n\r\n`));
    chunks.push(typeof part.body === "string" ? Buffer.from(part.body) : part.body);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

export function dictationBody({
  audio,
  audioType = "audio/wav",
  meta = { locale: "es-CO" },
}: {
  audio: Buffer;
  audioType?: string;
  meta?: unknown;
}): Buffer {
  return multipart([
    { name: "meta", body: JSON.stringify(meta) },
    { name: "audio", body: audio, filename: "dictation", contentType: audioType },
  ]);
}

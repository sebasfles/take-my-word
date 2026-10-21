import busboy from "busboy";
import {
  audioContentTypes,
  dictationFields,
  dictationMetaSchema,
  maxAudioBytes,
  type AudioContainer,
  type DictationMeta,
} from "@take-my-word/shared";
import { HttpError } from "../lib/http-error.ts";

export interface DictationUpload {
  meta: DictationMeta;
  audio: { container: AudioContainer; bytes: Buffer };
}

interface Parts {
  meta: string | undefined;
  audio: { bytes: Buffer; mimeType: string } | undefined;
}

const maxMetaBytes = 4096;
const multipartOverheadBytes = 64 * 1024;

function mediaType(contentType: string | undefined): string {
  return (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function tooLarge(): HttpError {
  return new HttpError("payload_too_large", `Audio is limited to ${maxAudioBytes} bytes.`);
}

function malformed(): HttpError {
  return new HttpError("bad_request", "Malformed multipart body.");
}

function readParts(contentType: string, body: Buffer): Promise<Parts> {
  return new Promise((resolve, reject) => {
    let parser: busboy.Busboy;
    try {
      parser = busboy({
        headers: { "content-type": contentType },
        limits: {
          fileSize: maxAudioBytes + 1,
          fieldSize: maxMetaBytes,
          files: 2,
          fields: 4,
          parts: 6,
        },
      });
    } catch {
      reject(malformed());
      return;
    }

    const parts: Parts = { meta: undefined, audio: undefined };
    const pending: Promise<void>[] = [];
    let failure: HttpError | undefined;
    const fail = (error: HttpError) => {
      failure ??= error;
    };

    const setMeta = (value: string, truncated: boolean) => {
      if (truncated) fail(new HttpError("bad_request", "The meta part is too large."));
      if (parts.meta !== undefined) fail(new HttpError("bad_request", "Send one meta part."));
      parts.meta = value;
    };

    parser.on("field", (name, value, info) => {
      if (name === dictationFields.meta) setMeta(value, info.valueTruncated);
    });

    parser.on("file", (name, stream, info) => {
      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => {
        if (!truncated) chunks.push(chunk);
      });
      stream.on("limit", () => {
        truncated = true;
      });
      pending.push(
        new Promise((done) => {
          stream.on("end", () => {
            const bytes = Buffer.concat(chunks);
            if (name === dictationFields.audio) {
              if (truncated || bytes.length > maxAudioBytes) fail(tooLarge());
              if (parts.audio !== undefined)
                fail(new HttpError("bad_request", "Send one audio part."));
              parts.audio = { bytes, mimeType: info.mimeType };
            } else if (name === dictationFields.meta) {
              setMeta(bytes.toString("utf8"), truncated || bytes.length > maxMetaBytes);
            }
            done();
          });
        }),
      );
    });

    for (const event of ["partsLimit", "filesLimit", "fieldsLimit"] as const) {
      parser.on(event, () => {
        fail(new HttpError("bad_request", "Too many parts."));
      });
    }

    let settled = false;
    parser.on("error", () => {
      settled = true;
      reject(failure ?? malformed());
    });
    parser.on("close", () => {
      void Promise.all(pending).then(() => {
        if (settled) return;
        if (failure) reject(failure);
        else resolve(parts);
      });
    });
    parser.end(body);
  });
}

function parseMeta(raw: string | undefined): DictationMeta {
  if (raw === undefined) throw new HttpError("bad_request", "The meta part is missing.");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError("bad_request", "The meta part is not JSON.");
  }
  const parsed = dictationMetaSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "meta";
    throw new HttpError("bad_request", `Invalid ${where}: ${issue?.message ?? "invalid value"}.`);
  }
  return parsed.data;
}

export async function readDictationUpload(
  contentType: string | undefined,
  body: Buffer,
): Promise<DictationUpload> {
  if (contentType === undefined || mediaType(contentType) !== "multipart/form-data") {
    throw new HttpError(
      "unsupported_media_type",
      "Send multipart/form-data with audio and meta parts.",
    );
  }
  if (body.length > maxAudioBytes + multipartOverheadBytes) throw tooLarge();

  const parts = await readParts(contentType, body);
  if (parts.audio === undefined) throw new HttpError("bad_request", "The audio part is missing.");
  const container = audioContentTypes[mediaType(parts.audio.mimeType)];
  if (!container) {
    throw new HttpError(
      "unsupported_media_type",
      "Audio must be WAV (audio/wav) or m4a (audio/mp4).",
    );
  }
  return { meta: parseMeta(parts.meta), audio: { container, bytes: parts.audio.bytes } };
}

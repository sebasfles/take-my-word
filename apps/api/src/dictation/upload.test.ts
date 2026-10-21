import { maxAudioBytes } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import { wav } from "../testing/audio.ts";
import { dictationBody, multipart, multipartContentType } from "../testing/multipart.ts";
import { HttpError } from "../lib/http-error.ts";
import { readDictationUpload } from "./upload.ts";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error.code;
    throw error;
  }
  return "ok";
}

describe("readDictationUpload", () => {
  it("returns the meta and the audio bytes with their container", async () => {
    const audio = wav({ seconds: 1 });
    const upload = await readDictationUpload(multipartContentType, dictationBody({ audio }));
    expect(upload.meta).toEqual({ locale: "es-CO" });
    expect(upload.audio.container).toBe("wav");
    expect(upload.audio.bytes.equals(audio)).toBe(true);
  });

  it("accepts meta sent as a JSON file part", async () => {
    const body = multipart([
      {
        name: "meta",
        body: '{"locale":"en"}',
        filename: "meta.json",
        contentType: "application/json",
      },
      { name: "audio", body: Buffer.alloc(10), filename: "a.m4a", contentType: "audio/mp4" },
    ]);
    const upload = await readDictationUpload(multipartContentType, body);
    expect(upload.meta).toEqual({ locale: "en" });
    expect(upload.audio.container).toBe("m4a");
  });

  it("takes audio of exactly the limit", async () => {
    const body = dictationBody({ audio: Buffer.alloc(maxAudioBytes) });
    const upload = await readDictationUpload(multipartContentType, body);
    expect(upload.audio.bytes.length).toBe(maxAudioBytes);
  });

  it("answers payload_too_large one byte over the limit", async () => {
    const body = dictationBody({ audio: Buffer.alloc(maxAudioBytes + 1) });
    expect(await codeOf(readDictationUpload(multipartContentType, body))).toBe("payload_too_large");
  });

  it("answers payload_too_large for a body far over the limit before parsing it", async () => {
    const body = Buffer.alloc(maxAudioBytes * 2);
    expect(await codeOf(readDictationUpload(multipartContentType, body))).toBe("payload_too_large");
  });

  it.each([
    ["a JSON request", "application/json"],
    ["raw audio", "audio/wav"],
    ["no content type", undefined],
  ])("answers unsupported_media_type for %s", async (_, contentType) => {
    const body = dictationBody({ audio: wav({ seconds: 1 }) });
    expect(await codeOf(readDictationUpload(contentType, body))).toBe("unsupported_media_type");
  });

  it.each(["audio/ogg", "audio/webm", "application/octet-stream"])(
    "answers unsupported_media_type for an audio part of %s",
    async (audioType) => {
      const body = dictationBody({ audio: wav({ seconds: 1 }), audioType });
      expect(await codeOf(readDictationUpload(multipartContentType, body))).toBe(
        "unsupported_media_type",
      );
    },
  );

  it.each([
    ["no boundary", "multipart/form-data", dictationBody({ audio: Buffer.alloc(4) })],
    [
      "a truncated body",
      multipartContentType,
      dictationBody({ audio: Buffer.alloc(4) }).subarray(0, 60),
    ],
    ["no audio part", multipartContentType, multipart([{ name: "meta", body: '{"locale":"es"}' }])],
    [
      "no meta part",
      multipartContentType,
      multipart([
        { name: "audio", body: Buffer.alloc(4), filename: "a", contentType: "audio/wav" },
      ]),
    ],
    [
      "meta that is not JSON",
      multipartContentType,
      multipart([
        { name: "meta", body: "locale=es" },
        { name: "audio", body: Buffer.alloc(4), filename: "a", contentType: "audio/wav" },
      ]),
    ],
    [
      "an unknown provider",
      multipartContentType,
      dictationBody({
        audio: Buffer.alloc(4),
        meta: { locale: "es", sttProvider: "whisper-local" },
      }),
    ],
    [
      "two audio parts",
      multipartContentType,
      multipart([
        { name: "meta", body: '{"locale":"es"}' },
        { name: "audio", body: Buffer.alloc(4), filename: "a", contentType: "audio/wav" },
        { name: "audio", body: Buffer.alloc(4), filename: "b", contentType: "audio/wav" },
      ]),
    ],
  ])("answers bad_request for %s", async (_, contentType, body) => {
    expect(await codeOf(readDictationUpload(contentType, body))).toBe("bad_request");
  });
});

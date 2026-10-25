import { maxAudioBytes } from "@take-my-word/shared";
import { describe, expect, it } from "vitest";
import { wav } from "../testing/audio.ts";
import { dictationBody, multipart, multipartContentType } from "../testing/multipart.ts";
import { HttpError } from "../lib/http-error.ts";
import { readDictationUpload, readSegmentUpload } from "./upload.ts";

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

describe("earlier segments and segment uploads", () => {
  const audio = {
    name: "audio",
    body: wav({ seconds: 1 }),
    filename: "a",
    contentType: "audio/wav",
  };

  it("reads earlier segments from their own part, beyond the 4 KiB meta limit", async () => {
    const segments = [{ text: "palabra ".repeat(1000), receipt: "r" }];
    const body = multipart([
      { name: "meta", body: "{}" },
      { name: "segments", body: JSON.stringify(segments) },
      audio,
    ]);
    const upload = await readDictationUpload(multipartContentType, body);
    expect(upload.earlier).toEqual(segments);
  });

  it("leaves a request without segments exactly as before", async () => {
    const upload = await readDictationUpload(
      multipartContentType,
      dictationBody({ audio: wav({ seconds: 1 }) }),
    );
    expect(upload.earlier).toBeUndefined();
  });

  it("reads a segment's meta and previous text, which defaults to empty", async () => {
    const withPrevious = multipart([
      { name: "meta", body: '{"language":"es"}' },
      { name: "previous", body: "hola mundo" },
      audio,
    ]);
    expect(await readSegmentUpload(multipartContentType, withPrevious)).toMatchObject({
      meta: { language: "es" },
      previous: "hola mundo",
    });
    const without = multipart([{ name: "meta", body: "{}" }, audio]);
    expect((await readSegmentUpload(multipartContentType, without)).previous).toBe("");
  });

  it.each([
    [
      "meta over 4 KiB",
      [{ name: "meta", body: JSON.stringify({ appId: "x".repeat(5000) }) }, audio],
    ],
    [
      "segments that are not JSON",
      [{ name: "meta", body: "{}" }, { name: "segments", body: "a" }, audio],
    ],
    [
      "segments over 64 KiB",
      [
        { name: "meta", body: "{}" },
        { name: "segments", body: JSON.stringify([{ text: "x".repeat(70_000), receipt: "r" }]) },
        audio,
      ],
    ],
    [
      "two segments parts",
      [
        { name: "meta", body: "{}" },
        { name: "segments", body: "[]" },
        { name: "segments", body: "[]" },
        audio,
      ],
    ],
  ])("answers bad_request for %s", async (_, parts) => {
    expect(await codeOf(readDictationUpload(multipartContentType, multipart(parts)))).toBe(
      "bad_request",
    );
  });
});

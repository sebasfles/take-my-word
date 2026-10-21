import { describe, expect, it } from "vitest";
import { m4a, wav } from "../../testing/audio.ts";
import { audioDurationSeconds } from "./duration.ts";
import { InvalidAudioError } from "./invalid-audio.ts";

describe("audioDurationSeconds for WAV", () => {
  it("reads 16 kHz mono 16-bit from the header", () => {
    expect(audioDurationSeconds("wav", wav({ seconds: 7.5 }))).toBe(7.5);
  });

  it("uses the byte rate, so other PCM layouts are measured too", () => {
    expect(audioDurationSeconds("wav", wav({ seconds: 3, sampleRate: 48_000, channels: 2 }))).toBe(
      3,
    );
  });

  it("skips chunks between fmt and data", () => {
    expect(audioDurationSeconds("wav", wav({ seconds: 2, extraChunk: true }))).toBe(2);
  });

  it("never counts more audio than the body carries", () => {
    const full = wav({ seconds: 4 });
    const truncated = full.subarray(0, 44 + 16_000 * 2);
    expect(audioDurationSeconds("wav", truncated)).toBe(1);
  });

  it.each([
    ["an m4a declared as WAV", m4a({ seconds: 3 })],
    ["random bytes", Buffer.from("not audio at all")],
    ["a header without data", wav({ seconds: 1 }).subarray(0, 36)],
  ])("rejects %s", (_, bytes) => {
    expect(() => audioDurationSeconds("wav", bytes)).toThrow(InvalidAudioError);
  });

  it("rejects compressed WAV", () => {
    const bytes = wav({ seconds: 1 });
    bytes.writeUInt16LE(85, 20);
    expect(() => audioDurationSeconds("wav", bytes)).toThrow(InvalidAudioError);
  });
});

describe("audioDurationSeconds for m4a", () => {
  it("reads the movie header after the media data", () => {
    expect(audioDurationSeconds("m4a", m4a({ seconds: 9 }))).toBe(9);
  });

  it("reads the movie header before the media data", () => {
    expect(audioDurationSeconds("m4a", m4a({ seconds: 2.5, moovFirst: true }))).toBe(2.5);
  });

  it("reads version 1 movie headers", () => {
    expect(audioDurationSeconds("m4a", m4a({ seconds: 6, version: 1, timescale: 1000 }))).toBe(6);
  });

  it("falls back to the fragment duration", () => {
    expect(audioDurationSeconds("m4a", m4a({ seconds: 4, fragmented: true }))).toBe(4);
  });

  it.each([
    ["a WAV declared as m4a", wav({ seconds: 3 })],
    ["a truncated container", m4a({ seconds: 3 }).subarray(0, 40)],
    ["random bytes", Buffer.from("not audio at all, not even close")],
  ])("rejects %s", (_, bytes) => {
    expect(() => audioDurationSeconds("m4a", bytes)).toThrow(InvalidAudioError);
  });
});

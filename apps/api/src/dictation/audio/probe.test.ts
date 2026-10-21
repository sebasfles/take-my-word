import { describe, expect, it } from "vitest";
import { m4a, wav } from "../../testing/audio.ts";
import { probeAudio } from "./probe.ts";
import { AudioTooShortError, InvalidAudioError } from "./invalid-audio.ts";

const seconds = (...args: Parameters<typeof probeAudio>) => probeAudio(...args).seconds;
const level = (bytes: Buffer) => probeAudio("wav", bytes).sustainedLevelDbfs ?? 0;

describe("probeAudio for WAV", () => {
  it("measures 16 kHz mono 16-bit audio", () => {
    expect(seconds("wav", wav({ seconds: 7.5 }))).toBe(7.5);
  });

  it("skips chunks between fmt and data", () => {
    expect(seconds("wav", wav({ seconds: 2, extraChunk: true }))).toBe(2);
  });

  it("charges the bytes sent, not a data size of 0", () => {
    expect(seconds("wav", wav({ seconds: 6, declaredDataSize: 0 }))).toBe(6);
  });

  it("charges the bytes sent, not a data size smaller than them", () => {
    expect(seconds("wav", wav({ seconds: 6, declaredDataSize: 2 }))).toBe(6);
  });

  it("never charges more audio than the body carries", () => {
    const truncated = wav({ seconds: 4 }).subarray(0, 44 + 16_000 * 2);
    expect(seconds("wav", truncated)).toBe(1);
  });

  it.each([
    ["48 kHz", { sampleRate: 48_000 }],
    ["stereo", { channels: 2 }],
    ["8-bit", { bitsPerSample: 8 }],
  ])("rejects %s, which would undercount the bytes sent", (_, layout) => {
    expect(() => probeAudio("wav", wav({ seconds: 3, ...layout }))).toThrow(InvalidAudioError);
  });

  it.each([
    ["an m4a declared as WAV", m4a({ seconds: 3 })],
    ["random bytes", Buffer.from("not audio at all")],
    ["a header without data", wav({ seconds: 1 }).subarray(0, 36)],
  ])("rejects %s", (_, bytes) => {
    expect(() => probeAudio("wav", bytes)).toThrow(InvalidAudioError);
  });

  it("rejects compressed WAV", () => {
    const bytes = wav({ seconds: 1 });
    bytes.writeUInt16LE(85, 20);
    expect(() => probeAudio("wav", bytes)).toThrow(InvalidAudioError);
  });

  it("reports digital silence as no level at all", () => {
    expect(level(wav({ seconds: 2 }))).toBe(-Infinity);
  });

  it.each([-70, -45, -20])("measures a steady %s dBFS tone", (dbfs) => {
    expect(level(wav({ seconds: 2, toneDbfs: dbfs }))).toBeCloseTo(dbfs, 0);
  });

  it("is not lifted by a few clicks in near-silence", () => {
    expect(level(wav({ seconds: 2, toneDbfs: -70, clicks: 4 }))).toBeCloseTo(-70, 0);
  });

  it.each([0, 0.4])("rejects %s s of audio as too short", (seconds) => {
    expect(() => probeAudio("wav", wav({ seconds }))).toThrow(AudioTooShortError);
  });
});

describe("probeAudio for m4a", () => {
  it("reports no level, since m4a is not decoded", () => {
    expect(probeAudio("m4a", m4a({ seconds: 9 })).sustainedLevelDbfs).toBeUndefined();
  });

  it("reads the movie header after the media data", () => {
    expect(seconds("m4a", m4a({ seconds: 9 }))).toBe(9);
  });

  it("reads the movie header before the media data", () => {
    expect(seconds("m4a", m4a({ seconds: 2.5, moovFirst: true }))).toBe(2.5);
  });

  it("reads version 1 movie headers", () => {
    expect(seconds("m4a", m4a({ seconds: 6, version: 1, timescale: 1000 }))).toBe(6);
  });

  it("falls back to the fragment duration", () => {
    expect(seconds("m4a", m4a({ seconds: 4, fragmented: true }))).toBe(4);
  });

  it("keeps the declared duration when the payload fits it at 320 kbps", () => {
    expect(seconds("m4a", m4a({ seconds: 60, mediaBytes: 960_000 }))).toBe(60);
  });

  it("charges at least the payload at 320 kbps when the header claims less", () => {
    const lying = m4a({ seconds: 1 / 44_100, mediaBytes: 400_000 });
    expect(seconds("m4a", lying)).toBeCloseTo(lying.length / 40_000, 6);
    expect(seconds("m4a", lying)).toBeGreaterThanOrEqual(10);
  });

  it("rejects a short header on a small payload as too short", () => {
    expect(() => probeAudio("m4a", m4a({ seconds: 0.2 }))).toThrow(AudioTooShortError);
  });

  it.each([
    ["a WAV declared as m4a", wav({ seconds: 3 })],
    ["a truncated container", m4a({ seconds: 3 }).subarray(0, 40)],
    ["random bytes", Buffer.from("not audio at all, not even close")],
  ])("rejects %s", (_, bytes) => {
    expect(() => probeAudio("m4a", bytes)).toThrow(InvalidAudioError);
  });
});

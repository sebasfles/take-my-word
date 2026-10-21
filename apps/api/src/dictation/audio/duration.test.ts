import { describe, expect, it } from "vitest";
import { m4a, wav } from "../../testing/audio.ts";
import { chargeableSeconds } from "./duration.ts";
import { AudioTooShortError, InvalidAudioError } from "./invalid-audio.ts";

describe("chargeableSeconds for WAV", () => {
  it("measures 16 kHz mono 16-bit audio", () => {
    expect(chargeableSeconds("wav", wav({ seconds: 7.5 }))).toBe(7.5);
  });

  it("skips chunks between fmt and data", () => {
    expect(chargeableSeconds("wav", wav({ seconds: 2, extraChunk: true }))).toBe(2);
  });

  it("charges the bytes sent, not a data size of 0", () => {
    expect(chargeableSeconds("wav", wav({ seconds: 6, declaredDataSize: 0 }))).toBe(6);
  });

  it("charges the bytes sent, not a data size smaller than them", () => {
    expect(chargeableSeconds("wav", wav({ seconds: 6, declaredDataSize: 2 }))).toBe(6);
  });

  it("never charges more audio than the body carries", () => {
    const truncated = wav({ seconds: 4 }).subarray(0, 44 + 16_000 * 2);
    expect(chargeableSeconds("wav", truncated)).toBe(1);
  });

  it.each([
    ["48 kHz", { sampleRate: 48_000 }],
    ["stereo", { channels: 2 }],
    ["8-bit", { bitsPerSample: 8 }],
  ])("rejects %s, which would undercount the bytes sent", (_, layout) => {
    expect(() => chargeableSeconds("wav", wav({ seconds: 3, ...layout }))).toThrow(
      InvalidAudioError,
    );
  });

  it.each([
    ["an m4a declared as WAV", m4a({ seconds: 3 })],
    ["random bytes", Buffer.from("not audio at all")],
    ["a header without data", wav({ seconds: 1 }).subarray(0, 36)],
  ])("rejects %s", (_, bytes) => {
    expect(() => chargeableSeconds("wav", bytes)).toThrow(InvalidAudioError);
  });

  it("rejects compressed WAV", () => {
    const bytes = wav({ seconds: 1 });
    bytes.writeUInt16LE(85, 20);
    expect(() => chargeableSeconds("wav", bytes)).toThrow(InvalidAudioError);
  });

  it.each([0, 0.4])("rejects %s s of audio as too short", (seconds) => {
    expect(() => chargeableSeconds("wav", wav({ seconds }))).toThrow(AudioTooShortError);
  });
});

describe("chargeableSeconds for m4a", () => {
  it("reads the movie header after the media data", () => {
    expect(chargeableSeconds("m4a", m4a({ seconds: 9 }))).toBe(9);
  });

  it("reads the movie header before the media data", () => {
    expect(chargeableSeconds("m4a", m4a({ seconds: 2.5, moovFirst: true }))).toBe(2.5);
  });

  it("reads version 1 movie headers", () => {
    expect(chargeableSeconds("m4a", m4a({ seconds: 6, version: 1, timescale: 1000 }))).toBe(6);
  });

  it("falls back to the fragment duration", () => {
    expect(chargeableSeconds("m4a", m4a({ seconds: 4, fragmented: true }))).toBe(4);
  });

  it("keeps the declared duration when the payload fits it at 320 kbps", () => {
    expect(chargeableSeconds("m4a", m4a({ seconds: 60, mediaBytes: 960_000 }))).toBe(60);
  });

  it("charges at least the payload at 320 kbps when the header claims less", () => {
    const lying = m4a({ seconds: 1 / 44_100, mediaBytes: 400_000 });
    expect(chargeableSeconds("m4a", lying)).toBeCloseTo(lying.length / 40_000, 6);
    expect(chargeableSeconds("m4a", lying)).toBeGreaterThanOrEqual(10);
  });

  it("rejects a short header on a small payload as too short", () => {
    expect(() => chargeableSeconds("m4a", m4a({ seconds: 0.2 }))).toThrow(AudioTooShortError);
  });

  it.each([
    ["a WAV declared as m4a", wav({ seconds: 3 })],
    ["a truncated container", m4a({ seconds: 3 }).subarray(0, 40)],
    ["random bytes", Buffer.from("not audio at all, not even close")],
  ])("rejects %s", (_, bytes) => {
    expect(() => chargeableSeconds("m4a", bytes)).toThrow(InvalidAudioError);
  });
});

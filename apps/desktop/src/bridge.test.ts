import { afterEach, describe, expect, it, vi } from "vitest";
import { keepListening } from "./bridge.ts";

const refused = () => Promise.reject(new Error("refused"));

describe("keepListening", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps trying a subscription the shell refused until it attaches", async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    const subscribe = vi
      .fn<() => Promise<() => void>>()
      .mockImplementationOnce(refused)
      .mockImplementationOnce(refused)
      .mockResolvedValue(stop);
    const unsubscribe = keepListening(subscribe, 100);
    await vi.advanceTimersByTimeAsync(250);
    expect(subscribe).toHaveBeenCalledTimes(3);
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("stops trying once the view that listens is gone", async () => {
    vi.useFakeTimers();
    const subscribe = vi.fn<() => Promise<() => void>>(refused);
    const unsubscribe = keepListening(subscribe, 100);
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();
    await vi.advanceTimersByTimeAsync(1000);
    expect(subscribe).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import { quotaWindow } from "./quota.ts";

describe("quotaWindow", () => {
  it("names the UTC day, not the local one", () => {
    expect(quotaWindow(new Date("2026-10-20T23:59:59.999-05:00")).day).toBe("2026-10-21");
    expect(quotaWindow(new Date("2026-10-20T23:59:59.999Z")).day).toBe("2026-10-20");
  });

  it("starts a new counter at UTC midnight", () => {
    const before = quotaWindow(new Date("2026-10-20T23:59:59.999Z"));
    const after = quotaWindow(new Date("2026-10-21T00:00:00.000Z"));
    expect(after.day).not.toBe(before.day);
  });

  it("expires the counter two days after its day starts", () => {
    const { expiresAt } = quotaWindow(new Date("2026-10-20T15:30:00Z"));
    expect(new Date(expiresAt * 1000).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
});

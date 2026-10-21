import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "./log.ts";

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes only the error's name, never its message or the values it carries", () => {
    const lines: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args);
    });
    const error = new Error("password Secret-password-1 for crew-e2e, token eyJraWQ");
    error.name = "NotAuthorizedException";
    Object.assign(error, { password: "Secret-password-1" });

    logError("sign-in failed", error);

    expect(lines).toEqual([
      [
        JSON.stringify({
          level: "error",
          message: "sign-in failed",
          error: "NotAuthorizedException",
        }),
      ],
    ]);
  });

  it("writes unknown for a thrown value that is not an error", () => {
    const lines: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args);
    });
    logError("refresh failed", "Secret-password-1");
    expect(JSON.stringify(lines)).not.toContain("Secret-password-1");
    expect(JSON.stringify(lines)).toContain('\\"error\\":\\"unknown\\"');
  });
});

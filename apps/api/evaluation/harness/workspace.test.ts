import { describe, expect, it } from "vitest";
import { deployAndWarm } from "./suite.ts";
import { accountGuard, WrongAccountError, type Workspace } from "./workspace.ts";

describe("accountGuard", () => {
  it("lets the deployment's account through and asks STS once", async () => {
    let calls = 0;
    const guard = accountGuard(() => {
      calls += 1;
      return Promise.resolve("123456789012");
    }, "123456789012");
    await guard();
    await guard();
    expect(calls).toBe(1);
  });

  it("refuses credentials of another account before anything is swapped or invoked", async () => {
    const guard = accountGuard(() => Promise.resolve("210987654321"), "123456789012");
    await expect(guard()).rejects.toThrow(WrongAccountError);
    await expect(guard()).rejects.toThrow(/210987654321, not the deployment's 123456789012/);
  });

  it("stops the eval swap before it reaches Lambda", async () => {
    let touched = false;
    const workspace = {
      evalFunctionName: "take-my-word-dev-eval",
      lambda: {
        send: () => {
          touched = true;
          return Promise.reject(new Error("touched"));
        },
      },
      requireAccount: accountGuard(() => Promise.resolve("210987654321"), "123456789012"),
    } as unknown as Workspace;
    await expect(deployAndWarm(workspace)).rejects.toThrow(WrongAccountError);
    expect(touched).toBe(false);
  });
});

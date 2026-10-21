import { describe, expect, it } from "vitest";
import { refreshLockName, withRefreshLock, type LockManagerLike } from "./refresh-lock.ts";

describe("withRefreshLock", () => {
  it("runs the renewal inside the one lock every tab of the origin shares", async () => {
    const requested: string[] = [];
    const locks: LockManagerLike = {
      request: (name, callback) => {
        requested.push(name);
        return callback();
      },
    };
    expect(await withRefreshLock(() => Promise.resolve("renewed"), locks)).toBe("renewed");
    expect(requested).toEqual([refreshLockName]);
  });

  it("still renews in a browser without the Web Locks API", async () => {
    expect(await withRefreshLock(() => Promise.resolve("renewed"), undefined)).toBe("renewed");
  });
});

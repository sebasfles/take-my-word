import { describe, expect, it } from "vitest";
import { deleteDictation, type DeleteDeps } from "./delete-dictation.ts";

function deps(requests: number[], renewal = 200) {
  const calls: string[] = [];
  const fake: DeleteDeps = {
    request: (id) => {
      calls.push(`delete ${id}`);
      return Promise.resolve(requests.shift() ?? 0);
    },
    renew: () => {
      calls.push("renew");
      return Promise.resolve(renewal);
    },
  };
  return { fake, calls };
}

describe("deleteDictation", () => {
  it("deletes without renewing when the session is fresh", async () => {
    const { fake, calls } = deps([204]);
    expect(await deleteDictation("eA", fake)).toBe("deleted");
    expect(calls).toEqual(["delete eA"]);
  });

  it("renews under the lock and retries once when the handler answers 401", async () => {
    const { fake, calls } = deps([401, 204]);
    expect(await deleteDictation("eA", fake)).toBe("deleted");
    expect(calls).toEqual(["delete eA", "renew", "delete eA"]);
  });

  it("gives up after one retry", async () => {
    const { fake, calls } = deps([401, 401]);
    expect(await deleteDictation("eA", fake)).toBe("failed");
    expect(calls).toEqual(["delete eA", "renew", "delete eA"]);
  });

  it("signs out when the renewal is rejected, and fails when it cannot reach Cognito", async () => {
    expect(await deleteDictation("eA", deps([401], 401).fake)).toBe("signed-out");
    const unavailable = deps([401], 503);
    expect(await deleteDictation("eA", unavailable.fake)).toBe("failed");
    expect(unavailable.calls).toEqual(["delete eA", "renew"]);
  });

  it("treats a dictation already gone as deleted, and anything else as a failure", async () => {
    expect(await deleteDictation("eA", deps([404]).fake)).toBe("deleted");
    expect(await deleteDictation("eA", deps([503]).fake)).toBe("failed");
    expect(await deleteDictation("eA", deps([0]).fake)).toBe("failed");
  });
});

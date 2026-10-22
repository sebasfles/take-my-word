import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeBridge } from "./testing/bridge.ts";
import { ApiError, api } from "./api.ts";

vi.mock("./bridge.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./bridge.ts")>()),
  bridge: fakeBridge,
}));

const term = {
  id: "a2l1",
  term: "Kubernetes",
  aliases: ["cubernetes"],
  useCount: 1,
  lastUsedAt: "2026-10-21T10:00:00.000Z",
  createdAt: "2026-10-21T10:00:00.000Z",
};

async function failure(promise: Promise<unknown>) {
  const reason: unknown = await promise.catch((caught: unknown) => caught);
  expect(reason).toBeInstanceOf(ApiError);
  return (reason as ApiError).failure;
}

describe("api", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends a request normalized by the shared schema and parses the answer", async () => {
    fakeBridge.apiRequest.mockResolvedValueOnce(term);
    await expect(api.addTerm({ term: "  Kubernetes ", aliases: ["cubernetes"] })).resolves.toEqual(
      term,
    );
    expect(fakeBridge.apiRequest).toHaveBeenCalledWith({
      route: "addTerm",
      body: { term: "Kubernetes", aliases: ["cubernetes"] },
    });
  });

  it("refuses a request past the shared limits without reaching Rust", async () => {
    const tooLong = "x".repeat(65);
    expect(await failure(api.addTerm({ term: tooLong }))).toEqual({
      kind: "invalidRequest",
      status: null,
      code: null,
    });
    expect(await failure(api.createStyle({ name: "Mail", prompt: "" }))).toMatchObject({
      kind: "invalidRequest",
    });
    expect(fakeBridge.apiRequest).not.toHaveBeenCalled();
  });

  it("refuses an answer that does not match the contract", async () => {
    fakeBridge.apiRequest.mockResolvedValueOnce({ terms: [{ ...term, useCount: "1" }] });
    expect(await failure(api.listTerms())).toMatchObject({ kind: "invalidResponse" });
  });

  it("passes Rust's typed failure through", async () => {
    const conflict = { kind: "rejected", status: 409, code: "conflict" };
    fakeBridge.apiRequest.mockRejectedValueOnce(conflict);
    const reason: unknown = await api
      .addTerm({ term: "Kubernetes" })
      .catch((caught: unknown) => caught);
    expect(reason).toBeInstanceOf(ApiError);
    expect((reason as ApiError).is(409, "conflict")).toBe(true);
  });

  it("reads a delete's empty answer as done", async () => {
    fakeBridge.apiRequest.mockResolvedValueOnce(null);
    await expect(api.deleteDictation("abc")).resolves.toBeNull();
    expect(fakeBridge.apiRequest).toHaveBeenCalledWith({ route: "deleteDictation", id: "abc" });
  });
});

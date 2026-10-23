import { describe, expect, it } from "vitest";
import { discoveryHandler, discoveryOf } from "./discovery.ts";

const dev = {
  apiUrl: "https://api.dev.dictation.example.com",
  userPoolId: "us-east-1_DevPool01",
  clientId: "devclient0123456789abcdefgh",
};
const prd = {
  apiUrl: "https://api.dictation.example.com",
  userPoolId: "eu-central-1_PrdPool02",
  clientId: "prdclient0123456789abcdefgh",
};

describe("discovery", () => {
  it.each([
    ["dev", dev, "us-east-1"],
    ["prd", prd, "eu-central-1"],
  ])("serves the %s server with the region of its pool", async (_, config, region) => {
    const response = discoveryHandler(() => config)();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({ version: 1, region, ...config });
  });

  it("never serves a document clients would refuse", () => {
    expect(() => discoveryOf({ ...prd, userPoolId: "pool-without-region" })).toThrow();
    expect(() => discoveryOf({ ...prd, apiUrl: "http://api.dictation.example.com" })).toThrow();
  });
});

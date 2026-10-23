import { describe, expect, it } from "vitest";
import { discoverySchema, regionOfUserPool } from "./discovery.ts";

const discovery = {
  version: 1,
  apiUrl: "https://api.dictation.example.com",
  region: "eu-west-2",
  userPoolId: "eu-west-2_AbC123xyZ",
  clientId: "1example23client45id6789ab",
};

describe("discoverySchema", () => {
  it("reads a deployment's server and ignores keys a later version 1 adds", () => {
    expect(discoverySchema.parse({ ...discovery, motd: "hi" })).toEqual(discovery);
  });

  it.each([
    { version: 2 },
    { apiUrl: "http://api.dictation.example.com" },
    { apiUrl: "https://api.dictation.example.com/" },
    { apiUrl: "https://api.dictation.example.com:8443" },
    { apiUrl: "https://user@api.dictation.example.com" },
    { apiUrl: "https://api.dictation.example.com/v1?x=1" },
    { apiUrl: "https://localhost" },
    { region: "eu-west-2.evil.example" },
    { region: "evil.example/eu-west-2" },
    { region: "EU-WEST-2" },
    { userPoolId: "us-east-1_AbC123xyZ" },
    { userPoolId: "eu-west-2_" },
    { userPoolId: "eu-west-2_a/b" },
    { clientId: "client id" },
    { clientId: "" },
  ])("rejects %j", (change) => {
    expect(discoverySchema.safeParse({ ...discovery, ...change }).success).toBe(false);
  });

  it("refuses a document missing any field", () => {
    for (const key of Object.keys(discovery)) {
      const partial = Object.fromEntries(Object.entries(discovery).filter(([k]) => k !== key));
      expect(discoverySchema.safeParse(partial).success, key).toBe(false);
    }
  });
});

describe("regionOfUserPool", () => {
  it("is the prefix of a well-formed pool id and nothing else", () => {
    expect(regionOfUserPool("ap-southeast-2_Xy9")).toBe("ap-southeast-2");
    expect(regionOfUserPool("not-a-pool")).toBeNull();
  });
});

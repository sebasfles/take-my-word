import { describe, expect, it } from "vitest";
import type { AppState } from "../../bridge.ts";
import { afterSignIn, needsOnboarding, planFor } from "./plan.ts";

const state = (change: Partial<AppState>): AppState => ({
  signedIn: true,
  username: "sebastian",
  firstRunDone: true,
  onboarded: true,
  handsFreeNote: false,
  ...change,
});

describe("the onboarding plan", () => {
  it("walks a fresh install through every step", () => {
    expect(
      planFor(state({ signedIn: false, firstRunDone: false, onboarded: false }), false),
    ).toEqual(["welcome", "signIn", "microphone", "hotkey", "languages", "style", "ready"]);
  });

  it("leaves an upgraded 0.2.0 user who already set up straight in the app", () => {
    expect(needsOnboarding(state({}))).toBe(false);
  });

  it("asks only for what is missing when someone signs in again later", () => {
    expect(planFor(state({ signedIn: false }), false)).toEqual(["signIn", "languages", "style"]);
    expect(planFor(state({ onboarded: false }), false)).toEqual(["languages", "style"]);
  });

  it("skips the personal steps after a sign-in that finds them done", () => {
    const plan = planFor(state({ signedIn: false }), false);
    expect(afterSignIn(plan, true)).toEqual(["signIn"]);
    expect(afterSignIn(plan, false)).toEqual(plan);
  });

  it("reruns every step but sign-in from Settings", () => {
    expect(planFor(state({}), true)).toEqual([
      "welcome",
      "microphone",
      "hotkey",
      "languages",
      "style",
      "ready",
    ]);
  });
});

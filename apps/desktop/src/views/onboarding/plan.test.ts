import { describe, expect, it } from "vitest";
import type { AppState } from "../../bridge.ts";
import { afterSignIn, isLastUserStep, planFor, steps } from "./plan.ts";

const state = (change: Partial<AppState>): AppState => ({
  signedIn: true,
  username: "sebastian",
  firstRunDone: true,
  onboarded: true,
  handsFreeNote: false,
  ...change,
});

const fresh = state({ signedIn: false, firstRunDone: false, onboarded: false });

describe("the onboarding plan", () => {
  it("walks a fresh install through every step", () => {
    expect(planFor(steps, fresh, false)).toEqual([
      "welcome",
      "signIn",
      "microphone",
      "hotkey",
      "languages",
      "context",
      "style",
      "ready",
    ]);
  });

  it("leaves an upgraded 0.2.0 user who already set up straight in the app", () => {
    expect(planFor(steps, state({}), false)).toEqual([]);
  });

  it("asks only for what is missing when someone signs in again later", () => {
    expect(planFor(steps, state({ signedIn: false }), false)).toEqual([
      "signIn",
      "languages",
      "context",
      "style",
    ]);
    expect(planFor(steps, state({ onboarded: false }), false)).toEqual([
      "languages",
      "context",
      "style",
    ]);
  });

  it("skips the personal steps after a sign-in that finds them done", () => {
    const plan = planFor(steps, state({ signedIn: false }), false);
    expect(afterSignIn(steps, plan, true)).toEqual(["signIn"]);
    expect(afterSignIn(steps, plan, false)).toEqual(plan);
  });

  it("reruns every step but sign-in from Settings", () => {
    expect(planFor(steps, state({}), true)).toEqual([
      "welcome",
      "microphone",
      "hotkey",
      "languages",
      "context",
      "style",
      "ready",
    ]);
  });

  it("asks what the user does as a personal step, resumed and rerun alike, saved with the style", () => {
    expect(planFor(steps, state({}), true)).toContain("context");
    const signedOut = planFor(steps, state({ signedIn: false }), false);
    expect(afterSignIn(steps, signedOut, true)).toEqual(["signIn"]);
    expect(isLastUserStep(steps, signedOut, "style")).toBe(true);
    expect(isLastUserStep(steps, signedOut, "context")).toBe(false);
  });
});

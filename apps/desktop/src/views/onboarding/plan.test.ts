import { describe, expect, it } from "vitest";
import type { AppState } from "../../bridge.ts";
import { afterSignIn, isLastUserStep, planFor, type Step, steps } from "./plan.ts";

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
      "style",
    ]);
    expect(planFor(steps, state({ onboarded: false }), false)).toEqual(["languages", "style"]);
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
      "style",
      "ready",
    ]);
  });

  it("takes one more personal step as a single catalog entry, in order, resumed and rerun alike", () => {
    const withRole: Step[] = [
      ...steps.slice(0, 5),
      { id: "role", scope: "user" },
      ...steps.slice(5),
    ];
    expect(planFor(withRole, fresh, false)).toEqual([
      "welcome",
      "signIn",
      "microphone",
      "hotkey",
      "languages",
      "role",
      "style",
      "ready",
    ]);
    expect(planFor(withRole, state({ onboarded: false }), false)).toEqual([
      "languages",
      "role",
      "style",
    ]);
    expect(planFor(withRole, state({}), true)).toContain("role");
    const signedOut = planFor(withRole, state({ signedIn: false }), false);
    expect(afterSignIn(withRole, signedOut, true)).toEqual(["signIn"]);
    expect(isLastUserStep(withRole, signedOut, "style")).toBe(true);
    expect(isLastUserStep(withRole, signedOut, "role")).toBe(false);
  });
});

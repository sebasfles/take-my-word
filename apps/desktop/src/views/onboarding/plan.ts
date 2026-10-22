import type { AppState } from "../../bridge.ts";

export const stepIds = [
  "welcome",
  "signIn",
  "microphone",
  "hotkey",
  "languages",
  "style",
  "ready",
] as const;
export type StepId = (typeof stepIds)[number];

export function needsOnboarding(state: AppState): boolean {
  return planFor(state, false).length > 0;
}

export function planFor(state: AppState, rerun: boolean): StepId[] {
  const full = rerun || !state.firstRunDone;
  const personal = full || !state.signedIn || !state.onboarded;
  return stepIds.filter((step) => {
    if (step === "signIn") return !state.signedIn;
    if (step === "languages" || step === "style") return personal;
    return full;
  });
}

export function afterSignIn(plan: readonly StepId[], alreadyOnboarded: boolean): StepId[] {
  if (!alreadyOnboarded) return [...plan];
  return plan.filter((step) => step !== "languages" && step !== "style");
}

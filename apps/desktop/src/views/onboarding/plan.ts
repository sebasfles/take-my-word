import type { AppState } from "../../bridge.ts";

export type Scope = "machine" | "account" | "user";

export interface Step<Id extends string = string> {
  readonly id: Id;
  readonly scope: Scope;
}

export const steps = [
  { id: "welcome", scope: "machine" },
  { id: "signIn", scope: "account" },
  { id: "microphone", scope: "machine" },
  { id: "hotkey", scope: "machine" },
  { id: "languages", scope: "user" },
  { id: "context", scope: "user" },
  { id: "style", scope: "user" },
  { id: "ready", scope: "machine" },
] as const satisfies readonly Step[];

export type StepId = (typeof steps)[number]["id"];

const scopeIn = <Id extends string>(catalog: readonly Step<Id>[], id: Id) =>
  catalog.find((step) => step.id === id)?.scope;

export function planFor<Id extends string>(
  catalog: readonly Step<Id>[],
  state: AppState,
  rerun: boolean,
): Id[] {
  const full = rerun || !state.firstRunDone;
  const wanted: Record<Scope, boolean> = {
    machine: full,
    account: !state.signedIn,
    user: full || !state.signedIn || !state.onboarded,
  };
  return catalog.filter((step) => wanted[step.scope]).map((step) => step.id);
}

export function afterSignIn<Id extends string>(
  catalog: readonly Step<Id>[],
  plan: readonly Id[],
  alreadyOnboarded: boolean,
): Id[] {
  if (!alreadyOnboarded) return [...plan];
  return plan.filter((id) => scopeIn(catalog, id) !== "user");
}

export function isLastUserStep<Id extends string>(
  catalog: readonly Step<Id>[],
  plan: readonly Id[],
  id: Id,
): boolean {
  return plan.findLast((planned) => scopeIn(catalog, planned) === "user") === id;
}

export function isUserStep<Id extends string>(catalog: readonly Step<Id>[], id: Id): boolean {
  return scopeIn(catalog, id) === "user";
}

export const views = ["settings", "first-run", "account", "overlay", "update"] as const;
export type View = (typeof views)[number];

export function viewFromSearch(search: string): View {
  const requested = new URLSearchParams(search).get("view");
  return views.find((view) => view === requested) ?? "settings";
}

export type AccountScreen = "sign-in" | "choose-password" | "onboarding";

export function accountScreenFromSearch(search: string): AccountScreen {
  return new URLSearchParams(search).get("step") === "onboarding" ? "onboarding" : "sign-in";
}

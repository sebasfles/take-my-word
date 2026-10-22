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

export const settingsSections = [
  "general",
  "dictionary",
  "styles",
  "appRules",
  "history",
  "account",
] as const;
export type SettingsSection = (typeof settingsSections)[number];

export function settingsSectionFromSearch(search: string): SettingsSection {
  const requested = new URLSearchParams(search).get("section");
  return settingsSections.find((section) => section === requested) ?? "general";
}

export function focusAddFromSearch(search: string): boolean {
  return new URLSearchParams(search).get("focus") === "add";
}

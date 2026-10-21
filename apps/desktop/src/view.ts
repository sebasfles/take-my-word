export const views = ["settings"] as const;
export type View = (typeof views)[number];

export function viewFromSearch(search: string): View {
  const requested = new URLSearchParams(search).get("view");
  return views.find((view) => view === requested) ?? "settings";
}

import type { Route } from "../api.ts";
import { fakeBridge } from "./bridge.ts";

type Handler = (route: Route) => unknown;

export function failure(status: number | null, code: string | null, kind = "rejected") {
  return Object.assign(new Error(kind), { kind, status, code });
}

export function serve(handlers: Partial<Record<Route["route"], Handler>>) {
  const seen: Route[] = [];
  fakeBridge.apiRequest.mockImplementation((route: Route) => {
    seen.push(route);
    const handler = handlers[route.route];
    if (!handler) return Promise.resolve(null);
    try {
      return Promise.resolve(handler(route));
    } catch (reason) {
      return Promise.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
  });
  return seen;
}

export const at = (day: number) => new Date(Date.UTC(2026, 9, day, 12)).toISOString();

export const builtins = [
  { id: "plain", name: "Plain", prompt: "", builtin: true },
  {
    id: "casual",
    name: "Casual",
    prompt: "Write casually, in the dictation's language.",
    builtin: true,
  },
  { id: "formal", name: "Formal", prompt: "Write formally.", builtin: true },
];

export const settings = {
  defaultStyleId: "plain",
  locale: "es-CL",
  dictationLanguages: ["es"],
  context: { picks: [], detail: "" },
};

import { fallbackStyleId } from "@take-my-word/shared";
import { builtinStyles, isBuiltinStyle } from "../styles/builtin/index.ts";

export interface ResolvedStyle {
  id: string;
  prompt: string;
}

export interface StyleCandidates {
  requested?: string | undefined;
  rule?: string | undefined;
  defaultStyleId?: string | undefined;
  custom: readonly { id: string; prompt: string }[];
}

export function resolveStyle({
  requested,
  rule,
  defaultStyleId,
  custom,
}: StyleCandidates): ResolvedStyle {
  for (const id of [requested, rule, defaultStyleId]) {
    if (id === undefined) continue;
    if (isBuiltinStyle(id)) return { id, prompt: builtinStyles[id].prompt };
    const style = custom.find((candidate) => candidate.id === id);
    if (style) return { id, prompt: style.prompt };
  }
  return { id: fallbackStyleId, prompt: builtinStyles[fallbackStyleId].prompt };
}

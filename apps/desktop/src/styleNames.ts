import { type BuiltinStyleId, builtinStyleIds } from "@take-my-word/shared";
import { type MessageId, t } from "./i18n.ts";

const builtinNames: Record<BuiltinStyleId, MessageId> = {
  plain: "style.plain.name",
  casual: "style.casual.name",
  formal: "style.formal.name",
};

function isBuiltin(id: string): id is BuiltinStyleId {
  return (builtinStyleIds as readonly string[]).includes(id);
}

export function styleName(style: { id: string; name: string; builtin: boolean }): string {
  return style.builtin && isBuiltin(style.id) ? t(builtinNames[style.id]) : style.name;
}

import { type BuiltinStyleId, builtinStyleIds } from "@take-my-word/shared";
import { type MessageId, t } from "./i18n.ts";

interface Named {
  id: string;
  name: string;
  builtin: boolean;
}

const builtinCopy: Record<BuiltinStyleId, { name: MessageId; description: MessageId }> = {
  plain: { name: "style.plain.name", description: "style.plain.description" },
  casual: { name: "style.casual.name", description: "style.casual.description" },
  formal: { name: "style.formal.name", description: "style.formal.description" },
};

function builtin(style: Named) {
  const id = style.id;
  return style.builtin && (builtinStyleIds as readonly string[]).includes(id)
    ? builtinCopy[id as BuiltinStyleId]
    : undefined;
}

export function styleName(style: Named): string {
  const copy = builtin(style);
  return copy ? t(copy.name) : style.name;
}

export function styleDescription(style: Named & { prompt?: string }): string | undefined {
  const copy = builtin(style);
  return copy ? t(copy.description) : style.prompt;
}

export function styleLabel(styleId: string | undefined, styles: readonly Named[]): string {
  if (styleId === undefined) return t("style.fallback");
  const style = styles.find((candidate) => candidate.id === styleId);
  return style ? styleName(style) : t("style.deleted");
}

import type { BuiltinStyleId } from "@take-my-word/shared";
import { builtinStyleIds } from "@take-my-word/shared";
import { casualV1 } from "./casual.v1.ts";
import { formalV1 } from "./formal.v1.ts";
import { plainV1 } from "./plain.v1.ts";

export const builtinStyles: Readonly<Record<BuiltinStyleId, { name: string; prompt: string }>> = {
  plain: plainV1,
  casual: casualV1,
  formal: formalV1,
};

export function isBuiltinStyle(id: string): id is BuiltinStyleId {
  return (builtinStyleIds as readonly string[]).includes(id);
}

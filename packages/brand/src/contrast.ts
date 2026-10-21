import type { ThemeColors } from "./tokens.ts";

type Role = keyof ThemeColors;

export interface Pair {
  foreground: Role;
  background: Role;
  minimum: number;
}

const body = 4.5;
const nonText = 3;
const surfaces: Role[] = ["bg", "surface", "sunken"];
const textRoles: Role[] = ["text", "muted", "accentText", "success", "warning", "error", "info"];

export const pairs: Pair[] = [
  ...textRoles.flatMap((foreground) =>
    surfaces.map((background) => ({ foreground, background, minimum: body })),
  ),
  { foreground: "onAccent", background: "accent", minimum: body },
  { foreground: "onAccent", background: "accentHover", minimum: body },
  { foreground: "text", background: "accentSoft", minimum: body },
  { foreground: "accentText", background: "accentSoft", minimum: body },
  { foreground: "success", background: "successSoft", minimum: body },
  { foreground: "warning", background: "warningSoft", minimum: body },
  { foreground: "error", background: "errorSoft", minimum: body },
  { foreground: "info", background: "infoSoft", minimum: body },
  { foreground: "text", background: "successSoft", minimum: body },
  { foreground: "text", background: "warningSoft", minimum: body },
  { foreground: "text", background: "errorSoft", minimum: body },
  { foreground: "text", background: "infoSoft", minimum: body },
  ...(["borderStrong", "focus"] as const).flatMap((foreground) =>
    surfaces.map((background) => ({ foreground, background, minimum: nonText })),
  ),
];

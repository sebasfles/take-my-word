export const scaleSteps = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
  "950",
] as const;
export type Scale = Record<(typeof scaleSteps)[number], string>;

export interface ThemeColors {
  bg: string;
  surface: string;
  sunken: string;
  text: string;
  muted: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentHover: string;
  onAccent: string;
  accentText: string;
  accentSoft: string;
  focus: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  error: string;
  errorSoft: string;
  info: string;
  infoSoft: string;
}

export interface Theme {
  colors: ThemeColors;
  shadow: Record<"sm" | "md" | "lg", string>;
}

export interface Tokens {
  accent: Scale;
  neutral: Scale;
  light: Theme;
  dark: Theme;
  font: Record<"display" | "text" | "mono", string>;
  weight: Record<"regular" | "medium" | "bold" | "display", string>;
  text: Record<"xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl", string>;
  leading: Record<"tight" | "snug" | "normal", string>;
  tracking: Record<"display" | "tight" | "normal" | "caps", string>;
  space: Record<
    "0" | "1" | "2" | "3" | "4" | "5" | "6" | "8" | "10" | "12" | "16" | "20" | "24",
    string
  >;
  radius: Record<"sm" | "md" | "lg" | "xl" | "full", string>;
  border: Record<"thin" | "thick" | "focus", string>;
  z: Record<"base" | "raised" | "sticky" | "overlay" | "dialog" | "toast", string>;
  duration: Record<"fast" | "normal" | "slow" | "demo", string>;
  ease: Record<"standard" | "out" | "emphasized", string>;
}

export const semanticLight = {
  success: "#1b7340",
  successSoft: "#e5f3e9",
  warning: "#8a5300",
  warningSoft: "#fbefd8",
  error: "#b3261e",
  errorSoft: "#fceae8",
  info: "#1e5aa0",
  infoSoft: "#e7effa",
} satisfies Partial<ThemeColors>;

export const semanticDark = {
  success: "#74cf99",
  successSoft: "#12301f",
  warning: "#f1b552",
  warningSoft: "#33260d",
  error: "#f4897d",
  errorSoft: "#3a1512",
  info: "#89b6f1",
  infoSoft: "#13253d",
} satisfies Partial<ThemeColors>;

export const base = {
  text: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.375rem",
    "2xl": "1.75rem",
    "3xl": "clamp(2rem, 1.6rem + 1.6vw, 2.75rem)",
    "4xl": "clamp(2.5rem, 1.7rem + 3.4vw, 4rem)",
    "5xl": "clamp(3rem, 1.6rem + 6vw, 6rem)",
  },
  leading: { tight: "1.05", snug: "1.25", normal: "1.6" },
  space: {
    "0": "0",
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
    "12": "3rem",
    "16": "4rem",
    "20": "5rem",
    "24": "6rem",
  },
  border: { thin: "1px", thick: "2px", focus: "2px" },
  z: { base: "0", raised: "10", sticky: "100", overlay: "1000", dialog: "1100", toast: "1200" },
  duration: { fast: "120ms", normal: "200ms", slow: "360ms", demo: "9s" },
  ease: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  },
  mono: 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

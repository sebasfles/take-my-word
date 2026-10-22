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
  overlay: string;
  onOverlay: string;
  overlayAccent: string;
  scrim: string;
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
  size: Record<"content" | "prose" | "narrow" | "control" | "controlLarge", string>;
  border: Record<"thin" | "thick" | "focus", string>;
  z: Record<"base" | "raised" | "sticky" | "overlay" | "dialog" | "toast", string>;
  duration: Record<"fast" | "normal" | "slow" | "blink" | "demo", string>;
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
  size: {
    content: "76rem",
    prose: "40rem",
    narrow: "28rem",
    control: "2.75rem",
    controlLarge: "3.25rem",
  },
  z: { base: "0", raised: "10", sticky: "100", overlay: "1000", dialog: "1100", toast: "1200" },
  duration: { fast: "120ms", normal: "200ms", slow: "360ms", blink: "1s", demo: "9s" },
  ease: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    out: "cubic-bezier(0, 0, 0.2, 1)",
    emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  },
  mono: 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace',
} as const;

export const tokens: Tokens = {
  ...base,
  accent: {
    "50": "#fff4f0",
    "100": "#ffe7df",
    "200": "#ffcebd",
    "300": "#ffaa8d",
    "400": "#f8845b",
    "500": "#e46535",
    "600": "#c84b15",
    "700": "#a73800",
    "800": "#832a00",
    "900": "#611d00",
    "950": "#411000",
  },
  neutral: {
    "50": "#fbf6f0",
    "100": "#f4ebe4",
    "200": "#e2d9d2",
    "300": "#cac1ba",
    "400": "#b0a7a1",
    "500": "#978f88",
    "600": "#7f7771",
    "700": "#68605a",
    "800": "#524a44",
    "900": "#3c3530",
    "950": "#28211c",
  },
  light: {
    colors: {
      bg: "#f8f1e7",
      surface: "#fffcf7",
      sunken: "#efe6d9",
      text: "#221b16",
      muted: "#675b51",
      border: "#e2d6c7",
      borderStrong: "#8c7d70",
      accent: "#c84b15",
      accentHover: "#a73800",
      onAccent: "#fffcf7",
      accentText: "#a73800",
      accentSoft: "#fbe2d5",
      focus: "#c84b15",
      overlay: "#221b16",
      onOverlay: "#fbf6f0",
      overlayAccent: "#f8845b",
      scrim: "rgb(34 27 22 / 0.45)",
      ...semanticLight,
    },
    shadow: {
      sm: "0 1px 2px rgb(60 35 15 / 0.08)",
      md: "0 2px 6px rgb(60 35 15 / 0.07), 0 10px 24px rgb(60 35 15 / 0.07)",
      lg: "0 4px 12px rgb(60 35 15 / 0.08), 0 24px 56px rgb(60 35 15 / 0.12)",
    },
  },
  dark: {
    colors: {
      bg: "#17120e",
      surface: "#211a15",
      sunken: "#110d0a",
      text: "#f4ece2",
      muted: "#b5a797",
      border: "#3a3029",
      borderStrong: "#8a7b6d",
      accent: "#f8845b",
      accentHover: "#ffaa8d",
      onAccent: "#1b0f08",
      accentText: "#ffaa8d",
      accentSoft: "#3b1e11",
      focus: "#f8845b",
      overlay: "#30261f",
      onOverlay: "#f4ece2",
      overlayAccent: "#f8845b",
      scrim: "rgb(0 0 0 / 0.6)",
      ...semanticDark,
    },
    shadow: {
      sm: "0 1px 2px rgb(0 0 0 / 0.4)",
      md: "0 2px 6px rgb(0 0 0 / 0.35), 0 10px 24px rgb(0 0 0 / 0.3)",
      lg: "0 4px 12px rgb(0 0 0 / 0.4), 0 24px 56px rgb(0 0 0 / 0.45)",
    },
  },
  font: {
    display:
      'var(--font-face-display, "Fraunces"), "Fraunces Fallback", Georgia, "Times New Roman", serif',
    text: 'var(--font-face-text, "Instrument Sans"), "Instrument Sans Fallback", system-ui, "Segoe UI", sans-serif',
    mono: base.mono,
  },
  weight: { regular: "400", medium: "500", bold: "620", display: "560" },
  tracking: { display: "-0.025em", tight: "-0.01em", normal: "0", caps: "0.14em" },
  radius: { sm: "4px", md: "8px", lg: "14px", xl: "22px", full: "999px" },
};

import localFont from "next/font/local";

export const displayFace = localFont({
  src: [
    {
      path: "../../../../packages/brand/src/fonts/fraunces.woff2",
      style: "normal",
      weight: "400 640",
    },
    {
      path: "../../../../packages/brand/src/fonts/fraunces-italic.woff2",
      style: "italic",
      weight: "400 640",
    },
  ],
  variable: "--font-face-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

export const textFace = localFont({
  src: [
    {
      path: "../../../../packages/brand/src/fonts/instrument-sans.woff2",
      style: "normal",
      weight: "400 700",
    },
  ],
  variable: "--font-face-text",
  display: "swap",
  adjustFontFallback: "Arial",
});

import type { MetadataRoute } from "next";
import { tokens } from "@take-my-word/brand";
import { dictionary } from "@/lib/i18n.ts";

export default function manifest(): MetadataRoute.Manifest {
  const t = dictionary("en");
  return {
    name: t.meta.title,
    short_name: t.meta.title,
    description: t.meta.description,
    start_url: "/",
    display: "standalone",
    background_color: tokens.light.colors.bg,
    theme_color: tokens.light.colors.accent,
    icons: [
      { src: "/static/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/static/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/static/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

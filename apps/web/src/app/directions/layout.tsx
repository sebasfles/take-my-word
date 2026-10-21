import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@take-my-word/brand/waveform.css";
import "@take-my-word/brand/directions/a/fonts.css";
import "@take-my-word/brand/directions/b/fonts.css";
import "@take-my-word/brand/directions/c/fonts.css";
import "@take-my-word/brand/directions/a/tokens.css";
import "@take-my-word/brand/directions/b/tokens.css";
import "@take-my-word/brand/directions/c/tokens.css";
import "@take-my-word/brand/directions/board.css";
import "@take-my-word/brand/directions/demo.css";
import "@take-my-word/brand/directions/a/direction.css";
import "@take-my-word/brand/directions/b/direction.css";
import "@take-my-word/brand/directions/c/direction.css";
import { requireGallery } from "@/lib/server/gallery.ts";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DirectionsLayout({ children }: { children: ReactNode }) {
  await requireGallery();
  return children;
}

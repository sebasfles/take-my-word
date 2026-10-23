import type { ReactNode } from "react";
import { PublicLayout, publicViewport } from "@/components/public-layout.tsx";

export const generateViewport = publicViewport;

export default function Layout({ children }: { children: ReactNode }) {
  return <PublicLayout locale="en">{children}</PublicLayout>;
}

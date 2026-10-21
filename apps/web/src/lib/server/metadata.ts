import type { Metadata } from "next";
import type { Dictionary } from "../i18n.ts";
import { currentDictionary } from "./request.ts";

export async function sectionMetadata(title: (t: Dictionary) => string): Promise<Metadata> {
  const t = await currentDictionary();
  return { title: `${title(t)} · ${t.meta.title}` };
}

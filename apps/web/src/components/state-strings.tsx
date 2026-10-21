"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/lib/i18n.ts";

const StateStrings = createContext<Dictionary["state"] | null>(null);

export function StateStringsProvider(props: { value: Dictionary["state"]; children: ReactNode }) {
  return <StateStrings value={props.value}>{props.children}</StateStrings>;
}

export function useStateStrings(): Dictionary["state"] {
  const strings = useContext(StateStrings);
  if (strings === null) throw new Error("StateStringsProvider is missing");
  return strings;
}

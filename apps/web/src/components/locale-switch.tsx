"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n.ts";
import { signedFetch } from "@/lib/signed-fetch.ts";

export function LocaleSwitch(props: { target: Locale; text: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function switchLocale() {
    setPending(true);
    try {
      const response = await signedFetch("/api/locale", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: props.target }),
      });
      if (response.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="button button-ghost locale-switch"
      lang={props.target}
      aria-label={props.label}
      disabled={pending}
      onClick={() => void switchLocale()}
    >
      {props.text}
    </button>
  );
}

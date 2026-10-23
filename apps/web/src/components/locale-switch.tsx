"use client";

import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import type { Locale } from "@/lib/i18n.ts";
import { signedFetch } from "@/lib/signed-fetch.ts";

export function LocaleSwitch(props: {
  target: Locale;
  text: string;
  label: string;
  href?: string | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remember(): Promise<boolean> {
    const response = await signedFetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: props.target }),
    });
    return response.ok;
  }

  async function switchLocale() {
    setPending(true);
    try {
      if (await remember()) router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    setPending(true);
    try {
      await remember();
    } finally {
      window.location.assign(href);
    }
  }

  if (props.href !== undefined) {
    const href = props.href;
    return (
      <a
        className="locale-switch"
        href={href}
        hrefLang={props.target}
        lang={props.target}
        aria-label={props.label}
        aria-disabled={pending || undefined}
        onClick={(event) => void follow(event, href)}
      >
        {props.text}
      </a>
    );
  }

  return (
    <button
      type="button"
      className="locale-switch"
      lang={props.target}
      aria-label={props.label}
      disabled={pending}
      onClick={() => void switchLocale()}
    >
      {props.text}
    </button>
  );
}

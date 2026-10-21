"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signedFetch } from "@/lib/signed-fetch.ts";

export function SignOutButton({ text }: { text: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      await signedFetch("/api/session/sign-out", { method: "POST" });
    } finally {
      router.replace("/sign-in");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      className="button button-secondary"
      disabled={pending}
      onClick={() => void signOut()}
    >
      {text}
    </button>
  );
}

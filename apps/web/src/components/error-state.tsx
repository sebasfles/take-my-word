"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Dictionary } from "@/lib/i18n.ts";

export function ErrorState(props: { t: Dictionary["state"]; retry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    if (props.retry !== undefined) props.retry();
    else
      startTransition(() => {
        router.refresh();
      });
  }

  return (
    <div className="card state-card" role="alert" data-testid="error-state">
      <h2>{props.t.errorTitle}</h2>
      <p>{props.t.errorBody}</p>
      <button type="button" className="button button-secondary" disabled={pending} onClick={retry}>
        {props.t.retry}
      </button>
    </div>
  );
}

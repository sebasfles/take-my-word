"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@take-my-word/brand";
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
    <div className="state-card" role="alert" data-testid="error-state">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="state-icon">
        <path d="M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <h2>{props.t.errorTitle}</h2>
      <p>{props.t.errorBody}</p>
      <Button variant="secondary" loading={pending} onClick={retry}>
        {props.t.retry}
      </Button>
    </div>
  );
}

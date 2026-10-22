"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, OverlayPill } from "@take-my-word/brand";
import type { Dictionary } from "@/lib/i18n.ts";
import { renewSession } from "@/lib/renew.ts";

export function RenewSession({ t }: { t: Dictionary["renew"] }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const settle = useCallback(
    (status: number) => {
      if (status === 200) router.refresh();
      else if (status === 401) router.replace("/sign-in");
      else setFailed(true);
    },
    [router],
  );

  useEffect(() => {
    let active = true;
    void renewSession().then((status) => {
      if (active) settle(status);
    });
    return () => {
      active = false;
    };
  }, [settle]);

  function retry() {
    setFailed(false);
    void renewSession().then(settle);
  }

  return (
    <div className="state-card renew" aria-live="polite">
      {failed ? (
        <div className="renew-failed">
          <p role="alert" className="form-error">
            {t.unavailable}
          </p>
          <Button variant="secondary" onClick={retry}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <OverlayPill state="processing" label={t.renewing} />
      )}
    </div>
  );
}

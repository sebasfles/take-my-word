"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
    <div className="card account-card" aria-live="polite">
      {failed ? (
        <div className="renew-failed">
          <p role="alert" className="form-error">
            {t.unavailable}
          </p>
          <button type="button" className="button button-secondary" onClick={retry}>
            {t.retry}
          </button>
        </div>
      ) : (
        <p className="renewing">{t.renewing}</p>
      )}
    </div>
  );
}

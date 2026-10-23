import { useEffect, useState } from "react";
import type { Usage } from "@take-my-word/shared";
import { api, ApiError } from "../../api.ts";
import { apiProblem, type Note } from "../../editing.ts";
import { language, t } from "../../i18n.ts";
import { ErrorLine } from "./parts.tsx";

type State = { kind: "loading" } | { kind: "hidden" } | { kind: "shown"; usage: Usage };

export function UsageCard() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [error, setError] = useState<Note | null>(null);

  useEffect(() => {
    api.getUsage().then(
      (usage) => {
        setState({ kind: "shown", usage });
      },
      (reason: unknown) => {
        setState({ kind: "hidden" });
        if (!(reason instanceof ApiError && reason.is(404))) setError(apiProblem(reason));
      },
    );
  }, []);

  if (state.kind === "loading" || (state.kind === "hidden" && error === null)) return null;
  return (
    <section className="panel aside-card usage" aria-labelledby="usage-title">
      <h2 id="usage-title" className="aside-title">
        {t("settings.usage")}
      </h2>
      {state.kind === "shown" && <UsageMeter usage={state.usage} />}
      <ErrorLine message={error} />
    </section>
  );
}

function UsageMeter({ usage }: { usage: Usage }) {
  const used = Math.min(usage.usedSeconds, usage.capSeconds);
  const time = new Intl.DateTimeFormat(language(), { timeStyle: "short" }).format(
    new Date(usage.resetsAt),
  );
  return (
    <>
      <p className="usage-amount">
        {t("settings.usage.used", {
          used: Math.ceil(used / 60),
          cap: Math.round(usage.capSeconds / 60),
        })}
      </p>
      <meter className="usage-meter" min={0} max={usage.capSeconds} value={used} />
      <p className="setting-note">{t("settings.usage.resets", { time })}</p>
    </>
  );
}

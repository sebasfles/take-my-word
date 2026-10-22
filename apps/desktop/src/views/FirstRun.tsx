import { useEffect, useState } from "react";
import { bridge, type Overview } from "../bridge.ts";
import { t } from "../i18n.ts";
import { Keys } from "../Keys.tsx";

export function FirstRun() {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const blocked = overview?.microphone === "denied";
  const missing = overview?.microphone === "missing";

  return (
    <main className="page">
      <header className="page-header">
        <h1>{t("firstRun.title")}</h1>
        <p className="muted">{t("firstRun.tagline")}</p>
      </header>

      <ol className="steps">
        <li>
          <span className="step-number">1</span>
          <span>{t("firstRun.step1")}</span>
        </li>
        <li>
          <span className="step-number">2</span>
          <span>
            {t("firstRun.step2Before")} <Keys keys={overview?.hotkey ?? ["Ctrl", "Win"]} />{" "}
            {t("firstRun.step2After")}
          </span>
        </li>
        <li>
          <span className="step-number">3</span>
          <span>{t("firstRun.step3")}</span>
        </li>
      </ol>

      <section className="note">
        <h2>{t("firstRun.microphone")}</h2>
        <p className="muted">{t("firstRun.microphoneNote")}</p>
        {blocked && (
          <div className="callout" role="alert">
            <p>{t("firstRun.microphoneBlocked")}</p>
            <button
              type="button"
              className="button"
              onClick={() => void bridge.openMicrophoneSettings()}
            >
              {t("firstRun.openMicrophoneSettings")}
            </button>
          </div>
        )}
        {missing && (
          <div className="callout" role="alert">
            <p>{t("firstRun.microphoneMissing")}</p>
          </div>
        )}
      </section>

      <footer className="page-footer">
        <button
          type="button"
          className="button button-primary"
          onClick={() => void bridge.finishFirstRun()}
        >
          {t("firstRun.done")}
        </button>
      </footer>
    </main>
  );
}

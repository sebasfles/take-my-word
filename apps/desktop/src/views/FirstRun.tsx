import { useEffect, useState } from "react";
import { Button, buttonClass } from "@take-my-word/brand";
import { bridge, type Overview } from "../bridge.ts";
import { t } from "../i18n.ts";
import { Keys } from "../Keys.tsx";
import { WindowPage } from "./WindowPage.tsx";

export function FirstRun() {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const blocked = overview?.microphone === "denied";
  const missing = overview?.microphone === "missing";

  return (
    <WindowPage title={t("firstRun.title")} intro={t("firstRun.tagline")}>
      <ol className="steps">
        <li>
          <span className="step-number">1</span>
          <span>{t("firstRun.step1")}</span>
        </li>
        <li>
          <span className="step-number">2</span>
          <span>
            {t("firstRun.step2Before")} {overview && <Keys keys={overview.hotkey} />}{" "}
            {t("firstRun.step2After")}
          </span>
        </li>
        <li>
          <span className="step-number">3</span>
          <span>{t("firstRun.step3")}</span>
        </li>
      </ol>

      {blocked || missing ? (
        <div className="failure" role="alert">
          <p>{t(blocked ? "firstRun.microphoneBlocked" : "firstRun.microphoneMissing")}</p>
          {blocked && (
            <button
              type="button"
              className={buttonClass({ variant: "secondary", size: "sm" })}
              onClick={() => void bridge.openMicrophoneSettings()}
            >
              {t("firstRun.openMicrophoneSettings")}
            </button>
          )}
        </div>
      ) : (
        <p className="setting-note">{t("firstRun.microphoneNote")}</p>
      )}

      <footer className="window-footer">
        <Button onClick={() => void bridge.finishFirstRun()}>{t("firstRun.done")}</Button>
      </footer>
    </WindowPage>
  );
}

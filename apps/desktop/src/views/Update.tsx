import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@take-my-word/brand";
import { bridge, keepListening, type UpdateView } from "../bridge.ts";
import { t } from "../i18n.ts";
import { WindowPage } from "./WindowPage.tsx";

export function Update() {
  const [view, setView] = useState<UpdateView | null>(null);
  const fitted = useRef(false);
  const fitUpdate = useCallback((height: number) => {
    void bridge.fitUpdate(height, !fitted.current);
    fitted.current = true;
  }, []);

  useEffect(() => keepListening(() => bridge.onUpdate(setView)), []);

  useEffect(() => {
    void bridge.updateView().then((current) => {
      setView((shown) => shown ?? current);
    });
  }, []);

  if (!view) return null;
  const notes = view.notes.trim();

  return (
    <WindowPage
      onHeight={fitUpdate}
      title={t("update.title")}
      intro={<span className="version">{t("update.version", { version: view.version })}</span>}
    >
      {notes !== "" && (
        <section className="window-section">
          <h2>{t("update.notes")}</h2>
          <p className="update-notes">{notes}</p>
        </section>
      )}

      {view.phase === "downloading" && (
        <div className="update-progress" role="status">
          <span>
            {view.percent === null
              ? t("update.downloading")
              : t("update.downloadingPercent", { percent: view.percent })}
          </span>
          <progress
            max={100}
            {...(view.percent === null ? {} : { value: view.percent })}
            aria-label={t("update.downloading")}
          />
        </div>
      )}
      {view.phase === "installing" && (
        <p className="setting-note" role="status">
          {t("update.installing")}
        </p>
      )}
      {view.phase === "failed" && (
        <p className="form-error" role="alert">
          {t("update.failed")}
        </p>
      )}

      {(view.phase === "available" || view.phase === "failed") && (
        <footer className="window-footer">
          <Button variant="ghost" onClick={() => void bridge.postponeUpdate()}>
            {t("update.later")}
          </Button>
          <Button onClick={() => void bridge.installUpdate()}>
            {t(view.phase === "failed" ? "common.tryAgain" : "update.install")}
          </Button>
        </footer>
      )}
    </WindowPage>
  );
}

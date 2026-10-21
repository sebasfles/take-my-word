import { useEffect, useState } from "react";
import { bridge, keepListening, type UpdateView } from "../bridge.ts";
import { t } from "../i18n.ts";

export function Update() {
  const [view, setView] = useState<UpdateView | null>(null);

  useEffect(() => keepListening(() => bridge.onUpdate(setView)), []);

  useEffect(() => {
    void bridge.updateView().then((current) => {
      setView((shown) => shown ?? current);
    });
  }, []);

  if (!view) return null;
  const notes = view.notes.trim();

  return (
    <main className="page">
      <header className="page-header">
        <h1>{t("update.title")}</h1>
        <p className="muted">{t("update.version", { version: view.version })}</p>
      </header>

      {notes !== "" && (
        <section className="note">
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
        <p className="muted" role="status">
          {t("update.installing")}
        </p>
      )}
      {view.phase === "failed" && (
        <p className="error" role="alert">
          {t("update.failed")}
        </p>
      )}

      {(view.phase === "available" || view.phase === "failed") && (
        <footer className="page-footer row-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void bridge.postponeUpdate()}
          >
            {t("update.later")}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void bridge.installUpdate()}
          >
            {t(view.phase === "failed" ? "common.tryAgain" : "update.install")}
          </button>
        </footer>
      )}
    </main>
  );
}

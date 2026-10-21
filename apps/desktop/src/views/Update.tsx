import { useEffect, useState } from "react";
import { bridge, keepListening, type UpdateView } from "../bridge.ts";

const copy = {
  es: {
    title: "Hay una nueva versión de Take My Word",
    version: (version: string) => `Versión ${version}`,
    notes: "Novedades",
    later: "Más tarde",
    install: "Instalar y reiniciar",
    retry: "Reintentar",
    downloading: "Descargando la actualización",
    installing: "Instalando. Take My Word se reiniciará en unos segundos.",
    failed: "No se pudo instalar la actualización. Vuelve a intentarlo.",
  },
  en: {
    title: "A new version of Take My Word is ready",
    version: (version: string) => `Version ${version}`,
    notes: "What's new",
    later: "Later",
    install: "Install and restart",
    retry: "Try again",
    downloading: "Downloading the update",
    installing: "Installing. Take My Word will restart in a few seconds.",
    failed: "The update could not be installed. Try again.",
  },
};

export function Update() {
  const [view, setView] = useState<UpdateView | null>(null);

  useEffect(() => keepListening(() => bridge.onUpdate(setView)), []);

  useEffect(() => {
    void bridge.updateView().then((current) => {
      setView((shown) => shown ?? current);
    });
  }, []);

  if (!view) return null;
  const t = copy[view.language];
  const notes = view.notes.trim();

  return (
    <main className="page" lang={view.language}>
      <header className="page-header">
        <h1>{t.title}</h1>
        <p className="muted">{t.version(view.version)}</p>
      </header>

      {notes !== "" && (
        <section className="note">
          <h2>{t.notes}</h2>
          <p className="update-notes">{notes}</p>
        </section>
      )}

      {view.phase === "downloading" && (
        <div className="update-progress" role="status">
          <span>
            {t.downloading}
            {view.percent === null ? "" : ` ${view.percent}%`}
          </span>
          <progress
            max={100}
            {...(view.percent === null ? {} : { value: view.percent })}
            aria-label={t.downloading}
          />
        </div>
      )}
      {view.phase === "installing" && (
        <p className="muted" role="status">
          {t.installing}
        </p>
      )}
      {view.phase === "failed" && (
        <p className="error" role="alert">
          {t.failed}
        </p>
      )}

      {(view.phase === "available" || view.phase === "failed") && (
        <footer className="page-footer row-actions">
          <button
            type="button"
            className="button button-quiet"
            onClick={() => void bridge.postponeUpdate()}
          >
            {t.later}
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void bridge.installUpdate()}
          >
            {view.phase === "failed" ? t.retry : t.install}
          </button>
        </footer>
      )}
    </main>
  );
}

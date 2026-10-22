import { useEffect, useId, useState } from "react";
import { api } from "../../api.ts";
import { bridge, type UiLanguage } from "../../bridge.ts";
import { apiProblem, type Note } from "../../editing.ts";
import { type Language, t } from "../../i18n.ts";
import { LanguageChoices } from "../../LanguageChoices.tsx";
import { ErrorLine } from "./parts.tsx";

const windowsChoice = "windows";

export function UiLanguageRow() {
  const [state, setState] = useState<UiLanguage | null>(null);
  const id = useId();

  useEffect(() => {
    void bridge.uiLanguage().then(setState);
  }, []);

  const choose = (value: string) => {
    const choice: Language | null = value === "es" || value === "en" ? value : null;
    void bridge.setUiLanguage(choice).then(setState);
  };

  return (
    <section className="row">
      <div className="row-text">
        <label htmlFor={id}>
          <h2>{t("settings.uiLanguage")}</h2>
        </label>
        <p className="muted">{t("settings.uiLanguage.note")}</p>
      </div>
      <select
        id={id}
        className="input input-compact"
        disabled={!state}
        value={state?.choice ?? windowsChoice}
        onChange={(event) => {
          choose(event.target.value);
        }}
      >
        <option value={windowsChoice}>
          {t("settings.uiLanguage.windows", {
            language: t(`language.${state?.windows ?? "en"}`),
          })}
        </option>
        <option value="en">{t("language.en")}</option>
        <option value="es">{t("language.es")}</option>
      </select>
    </section>
  );
}

export function DictationLanguagesRow() {
  const [chosen, setChosen] = useState<Language[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  useEffect(() => {
    api.getSettings().then(
      (settings) => {
        setChosen(settings.dictationLanguages);
      },
      (reason: unknown) => {
        setError(apiProblem(reason));
      },
    );
  }, []);

  const change = (next: Language[]) => {
    const previous = chosen;
    setChosen(next);
    setBusy(true);
    setSaved(false);
    setError(null);
    api
      .getSettings()
      .then((settings) => api.replaceSettings({ ...settings, dictationLanguages: next }))
      .then((settings) => {
        setChosen(settings.dictationLanguages);
        setSaved(true);
      })
      .catch((reason: unknown) => {
        setChosen(previous);
        setError(apiProblem(reason));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <section className="row row-stacked">
      <div className="row-text">
        <h2>{t("dictationLanguages")}</h2>
        <p className="muted">{t("dictationLanguages.note")}</p>
        {saved && (
          <p className="muted" role="status">
            {t("common.saved")}
          </p>
        )}
        <ErrorLine message={error} />
      </div>
      {chosen && <LanguageChoices chosen={chosen} onChange={change} disabled={busy} />}
    </section>
  );
}

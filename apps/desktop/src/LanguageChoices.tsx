import { type Language, t } from "./i18n.ts";

const offered: Language[] = ["en", "es"];

export function toggled(chosen: readonly Language[], language: Language): Language[] {
  if (!chosen.includes(language)) return [...chosen, language];
  const left = chosen.filter((other) => other !== language);
  return left.length === 0 ? [...chosen] : left;
}

export function LanguageChoices({
  chosen,
  onChange,
  disabled = false,
}: {
  chosen: readonly Language[];
  onChange: (next: Language[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="choices choices-inline" role="group" aria-label={t("dictationLanguages")}>
      {offered.map((language) => {
        const checked = chosen.includes(language);
        const last = checked && chosen.length === 1;
        return (
          <label
            key={language}
            className="choice"
            title={last ? t("dictationLanguages.lastOne") : undefined}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || last}
              onChange={() => {
                onChange(toggled(chosen, language));
              }}
            />
            <span lang={language}>{t(`language.${language}`)}</span>
          </label>
        );
      })}
    </div>
  );
}

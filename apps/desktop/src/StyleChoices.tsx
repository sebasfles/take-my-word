import { useId } from "react";
import { t } from "./i18n.ts";
import { styleDescription, styleName } from "./styleNames.ts";

export interface ChoosableStyle {
  id: string;
  name: string;
  builtin: boolean;
  prompt?: string;
}

export function StyleChoices({
  styles,
  selected,
  onSelect,
}: {
  styles: readonly ChoosableStyle[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const name = useId();
  return (
    <fieldset className="choices">
      <legend className="visually-hidden">{t("styles.default")}</legend>
      {styles.map((style) => {
        const description = style.builtin ? styleDescription(style) : undefined;
        const describedBy = `${name}-${style.id}`;
        return (
          <label key={style.id} className="choice">
            <input
              type="radio"
              name={name}
              value={style.id}
              aria-label={styleName(style)}
              aria-describedby={description ? describedBy : undefined}
              checked={selected === style.id}
              onChange={() => {
                onSelect(style.id);
              }}
            />
            <span className="choice-text">
              <span>{styleName(style)}</span>
              {description && (
                <span id={describedBy} className="muted">
                  {description}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

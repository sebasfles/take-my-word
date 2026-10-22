import { type BuiltinStyleId, builtinStyleIds } from "@take-my-word/shared";
import { type ReactNode, useId } from "react";
import { language, t } from "./i18n.ts";
import { styleExamples } from "./styleExamples.ts";
import { styleDescription, styleName } from "./styleNames.ts";

export interface ChoosableStyle {
  id: string;
  name: string;
  builtin: boolean;
  prompt?: string;
}

const isBuiltin = (style: ChoosableStyle): style is ChoosableStyle & { id: BuiltinStyleId } =>
  style.builtin && (builtinStyleIds as readonly string[]).includes(style.id);

export function StyleExamples({
  styles,
  selected,
  onSelect,
}: {
  styles: readonly ChoosableStyle[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const name = useId();
  const example = styleExamples[language()];
  const builtins = styles.filter(isBuiltin);
  const custom = styles.filter((style) => !isBuiltin(style));

  const option = (style: ChoosableStyle, body: ReactNode) => {
    const described = `${name}-${style.id}`;
    return (
      <label key={style.id} className="example">
        <span className="example-head">
          <input
            type="radio"
            name={name}
            value={style.id}
            aria-label={styleName(style)}
            aria-describedby={described}
            checked={selected === style.id}
            onChange={() => {
              onSelect(style.id);
            }}
          />
          <span className="example-name">{styleName(style)}</span>
        </span>
        <span id={described} className="example-body">
          {body}
        </span>
      </label>
    );
  };

  return (
    <fieldset className="examples">
      <legend className="visually-hidden">{t("styles.default")}</legend>
      <figure className="example-said">
        <figcaption>{t("styles.said")}</figcaption>
        <blockquote lang={language()}>{example.said}</blockquote>
      </figure>
      <div className="example-grid">
        {builtins.map((style) =>
          option(
            style,
            <>
              <span className="example-text">{example.styles[style.id]}</span>
              <span className="example-note">{styleDescription(style)}</span>
            </>,
          ),
        )}
      </div>
      {custom.length > 0 && (
        <div className="example-grid">
          {custom.map((style) =>
            option(style, <span className="example-note clamp">{styleDescription(style)}</span>),
          )}
        </div>
      )}
    </fieldset>
  );
}

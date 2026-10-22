import { buttonClass } from "@take-my-word/brand";
import {
  fallbackStyleId,
  type Settings,
  type Style,
  type StyleInput,
  styleLimits,
} from "@take-my-word/shared";
import { type SubmitEvent, useId, useState } from "react";
import { api } from "../../api.ts";
import { apiProblem, type Note, note } from "../../editing.ts";
import { t } from "../../i18n.ts";
import { StyleChoices } from "../../StyleChoices.tsx";
import { styleDescription, styleName } from "../../styleNames.ts";
import { ConfirmDelete, Empty, ErrorLine, LoadState, SectionPage, useLoaded } from "./parts.tsx";

interface Data {
  styles: Style[];
  settings: Settings;
}

const loadStyles = async (): Promise<Data> => {
  const [list, settings] = await Promise.all([api.listStyles(), api.getSettings()]);
  return { styles: list.styles, settings };
};

function checkStyle(style: StyleInput, customCount?: number): Note | null {
  const name = style.name.trim();
  const prompt = style.prompt.trim();
  if (name === "") return note("styles.nameRequired");
  if (name.length > styleLimits.nameLength) {
    return note("styles.nameTooLong", { max: styleLimits.nameLength });
  }
  if (prompt === "") return note("styles.promptRequired");
  if (prompt.length > styleLimits.promptLength) {
    return note("styles.promptTooLong", { max: styleLimits.promptLength });
  }
  if (customCount !== undefined && customCount >= styleLimits.customStyles) {
    return note("styles.full", { max: styleLimits.customStyles });
  }
  return null;
}

const full = note("styles.full", { max: styleLimits.customStyles });

export function Styles() {
  const { state, retry, update } = useLoaded(loadStyles);
  const data = state.kind === "ready" ? state.data : null;
  const custom = data?.styles.filter((style) => !style.builtin) ?? [];

  return (
    <SectionPage title="settings.styles" intro="styles.intro">
      <LoadState state={state} onRetry={retry} />
      {data && (
        <>
          <DefaultStyle
            styles={data.styles}
            current={data.settings.defaultStyleId}
            onSaved={(settings) => {
              update((current) => ({ ...current, settings }));
            }}
          />

          <section className="list-section">
            <h2>{t("styles.builtin")}</h2>
            <ul className="list">
              {data.styles
                .filter((style) => style.builtin)
                .map((style) => (
                  <li key={style.id} className="item">
                    <div className="item-main">
                      <p className="item-title">{styleName(style)}</p>
                      <p className="muted">{styleDescription(style)}</p>
                    </div>
                  </li>
                ))}
            </ul>
          </section>

          <section className="list-section">
            <div className="list-heading">
              <h2>{t("styles.custom")}</h2>
              <p className="muted">
                {t("common.count", { count: custom.length, max: styleLimits.customStyles })}
              </p>
            </div>
            <StyleForm
              submitLabel="styles.create"
              check={(style) => checkStyle(style, custom.length)}
              save={(style) => api.createStyle(style)}
              expected={{ limit: full }}
              onSaved={(created) => {
                update((current) => ({ ...current, styles: [...current.styles, created] }));
              }}
            />
            {custom.length === 0 ? (
              <Empty title="styles.customEmptyTitle" body="styles.customEmpty" />
            ) : (
              <ul className="list">
                {custom.map((style) => (
                  <CustomStyleRow
                    key={style.id}
                    style={style}
                    onChanged={(changed) => {
                      update((current) => ({
                        ...current,
                        styles: current.styles.map((item) =>
                          item.id === changed.id ? changed : item,
                        ),
                      }));
                    }}
                    onDeleted={() => {
                      update((current) => ({
                        styles: current.styles.filter((item) => item.id !== style.id),
                        settings:
                          current.settings.defaultStyleId === style.id
                            ? { ...current.settings, defaultStyleId: fallbackStyleId }
                            : current.settings,
                      }));
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </SectionPage>
  );
}

function DefaultStyle({
  styles,
  current,
  onSaved,
}: {
  styles: Style[];
  current: string;
  onSaved: (settings: Settings) => void;
}) {
  const [picked, setSelected] = useState(current);
  const selected = styles.some((style) => style.id === picked) ? picked : current;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    api
      .getSettings()
      .then((settings) => api.replaceSettings({ ...settings, defaultStyleId: selected }))
      .then((settings) => {
        onSaved(settings);
        setSaved(true);
      })
      .catch((reason: unknown) => {
        setError(apiProblem(reason));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="form card" onSubmit={save}>
      <div className="setting-text">
        <h2 className="setting-title">{t("styles.default")}</h2>
        <p className="setting-note">{t("styles.defaultNote")}</p>
      </div>
      <StyleChoices
        styles={styles}
        selected={selected}
        onSelect={(id) => {
          setSelected(id);
          setSaved(false);
        }}
      />
      <ErrorLine message={error} />
      <div className="form-actions">
        {saved && (
          <p className="muted saved" role="status">
            {t("common.saved")}
          </p>
        )}
        <button type="submit" className={buttonClass()} disabled={busy || selected === current}>
          {t(busy ? "common.saving" : "common.save")}
        </button>
      </div>
    </form>
  );
}

function StyleForm({
  initial = { name: "", prompt: "" },
  submitLabel,
  check,
  save,
  expected,
  onSaved,
  onCancel,
}: {
  initial?: StyleInput;
  submitLabel: "styles.create" | "common.save";
  check: (style: StyleInput) => Note | null;
  save: (style: StyleInput) => Promise<Style>;
  expected?: { limit: Note };
  onSaved: (style: Style) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);
  const id = useId();

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const style = { name, prompt };
    const problem = check(style);
    setError(problem);
    if (problem) return;
    setBusy(true);
    save({ name: name.trim(), prompt: prompt.trim() })
      .then((saved) => {
        onSaved(saved);
        setName(initial.name);
        setPrompt(initial.prompt);
      })
      .catch((reason: unknown) => {
        setError(apiProblem(reason, expected));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <label className="field">
        <span>{t("styles.name")}</span>
        <input
          className="tmw-input"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      <div className="field">
        <label htmlFor={`${id}-field`}>{t("styles.prompt")}</label>
        <textarea
          id={`${id}-field`}
          className="tmw-input tmw-textarea"
          name="prompt"
          rows={4}
          aria-describedby={`${id}-hint`}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
        />
        <span id={`${id}-hint`} className="hint hint-split">
          <span>{t("styles.promptHint")}</span>
          <span className="nowrap">
            {prompt.trim().length}/{styleLimits.promptLength}
          </span>
        </span>
      </div>
      <ErrorLine message={error} />
      <div className="form-actions">
        {onCancel && (
          <button
            type="button"
            className={buttonClass({ variant: "secondary" })}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
        )}
        <button type="submit" className={buttonClass()} disabled={busy}>
          {t(submitLabel)}
        </button>
      </div>
    </form>
  );
}

function CustomStyleRow({
  style,
  onChanged,
  onDeleted,
}: {
  style: Style;
  onChanged: (style: Style) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  if (editing) {
    return (
      <li className="item item-editing">
        <StyleForm
          initial={{ name: style.name, prompt: style.prompt }}
          submitLabel="common.save"
          check={(input) => checkStyle(input)}
          save={(input) => api.updateStyle(style.id, input)}
          onSaved={(changed) => {
            onChanged(changed);
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="item">
      <div className="item-main">
        <p className="item-title">{style.name}</p>
        <p className="muted clamp">{style.prompt}</p>
        <ErrorLine message={error} />
      </div>
      <div className="item-actions">
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t("common.edit")}
        </button>
        <ConfirmDelete
          question="styles.confirmDelete"
          onConfirm={() =>
            api.deleteStyle(style.id).then(onDeleted, (reason: unknown) => {
              setError(apiProblem(reason));
            })
          }
        />
      </div>
    </li>
  );
}

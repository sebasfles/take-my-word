import { type AppRule, appRuleLimits, type PasteKeystroke, type Style } from "@take-my-word/shared";
import { buttonClass } from "@take-my-word/brand";
import { type SubmitEvent, useEffect, useId, useState } from "react";
import { api } from "../../api.ts";
import { bridge } from "../../bridge.ts";
import { apiProblem, type Note, note } from "../../editing.ts";
import { type MessageId, t } from "../../i18n.ts";
import { styleLabel, styleName } from "../../styleNames.ts";
import { ConfirmDelete, Empty, ErrorLine, LoadState, SectionPage, useLoaded } from "./parts.tsx";

const APP_ID_LENGTH = 256;

const keystrokes = ["ctrl+v", "ctrl+shift+v", "shift+insert"] as const;
type ChosenKeystroke = (typeof keystrokes)[number];

const keystrokeLabels: Record<PasteKeystroke, MessageId> = {
  "ctrl+v": "keystroke.ctrlV",
  "cmd+v": "keystroke.ctrlV",
  "ctrl+shift+v": "keystroke.ctrlShiftV",
  "shift+insert": "keystroke.shiftInsert",
};

const chosen = (keystroke: PasteKeystroke): ChosenKeystroke =>
  keystroke === "cmd+v" ? "ctrl+v" : keystroke;

interface Data {
  rules: AppRule[];
  styles: Style[];
}

const loadRules = async (): Promise<Data> => {
  const [list, styles] = await Promise.all([api.listAppRules(), api.listStyles()]);
  return { rules: list.rules, styles: styles.styles };
};

const sorted = (rules: AppRule[]) => [...rules].sort((a, b) => a.appId.localeCompare(b.appId));

const duplicate = note("appRules.duplicate");
const full = note("appRules.full", { max: appRuleLimits.rules });

export function AppRules() {
  const { state, retry, update } = useLoaded(loadRules);
  const data = state.kind === "ready" ? state.data : null;

  return (
    <SectionPage title="settings.appRules" intro="appRules.intro">
      {data && (
        <AddRule
          data={data}
          onAdded={(rule) => {
            update((current) => ({ ...current, rules: sorted([...current.rules, rule]) }));
          }}
        />
      )}
      <LoadState state={state} onRetry={retry} />
      {data && (
        <section className="list-section">
          <p className="muted">
            {t("common.count", { count: data.rules.length, max: appRuleLimits.rules })}
          </p>
          {data.rules.length === 0 ? (
            <Empty title="appRules.emptyTitle" body="appRules.empty" />
          ) : (
            <ul className="list">
              {data.rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  styles={data.styles}
                  onChanged={(changed) => {
                    update((current) => ({
                      ...current,
                      rules: current.rules.map((item) => (item.id === changed.id ? changed : item)),
                    }));
                  }}
                  onDeleted={() => {
                    update((current) => ({
                      ...current,
                      rules: current.rules.filter((item) => item.id !== rule.id),
                    }));
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </SectionPage>
  );
}

function StyleSelect({
  styles,
  value,
  onChange,
  label,
}: {
  styles: Style[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <span className="tmw-select">
      <select
        className="tmw-input"
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t("style.fallback")}</option>
        {styles.map((style) => (
          <option key={style.id} value={style.id}>
            {styleName(style)}
          </option>
        ))}
        {value !== "" && !styles.some((style) => style.id === value) && (
          <option value={value}>{t("style.deleted")}</option>
        )}
      </select>
    </span>
  );
}

function KeystrokeSelect({
  value,
  onChange,
  label,
}: {
  value: ChosenKeystroke;
  onChange: (value: ChosenKeystroke) => void;
  label?: string;
}) {
  return (
    <span className="tmw-select">
      <select
        className="tmw-input"
        aria-label={label}
        value={value}
        onChange={(event) => {
          const picked = keystrokes.find((keystroke) => keystroke === event.target.value);
          if (picked) onChange(picked);
        }}
      >
        {keystrokes.map((keystroke) => (
          <option key={keystroke} value={keystroke}>
            {t(keystrokeLabels[keystroke])}
          </option>
        ))}
      </select>
    </span>
  );
}

function AddRule({ data, onAdded }: { data: Data; onAdded: (rule: AppRule) => void }) {
  const [appId, setAppId] = useState("");
  const [styleId, setStyleId] = useState("");
  const [keystroke, setKeystroke] = useState<ChosenKeystroke>("ctrl+v");
  const [running, setRunning] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);
  const id = useId();

  useEffect(() => {
    bridge.runningApps().then(setRunning, () => {
      setRunning([]);
    });
  }, []);

  const check = (app: string): Note | null => {
    if (app === "") return note("appRules.appRequired");
    if (app.length > APP_ID_LENGTH) return note("appRules.appTooLong");
    if (data.rules.some((rule) => rule.appId === app)) return duplicate;
    if (data.rules.length >= appRuleLimits.rules) return full;
    return null;
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const app = appId.trim().toLowerCase();
    const problem = check(app);
    setError(problem);
    if (problem) return;
    setBusy(true);
    api
      .createAppRule({ appId: app, keystroke, ...(styleId !== "" && { styleId }) })
      .then((rule) => {
        onAdded(rule);
        setAppId("");
      })
      .catch((reason: unknown) => {
        setError(apiProblem(reason, { conflict: duplicate, limit: full }));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const taken = new Set(data.rules.map((rule) => rule.appId));

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${id}-field`}>{t("appRules.app")}</label>
        <input
          id={`${id}-field`}
          className="tmw-input"
          name="app"
          autoComplete="off"
          list={`${id}-apps`}
          aria-describedby={`${id}-hint`}
          value={appId}
          onChange={(event) => {
            setAppId(event.target.value);
          }}
        />
        <datalist id={`${id}-apps`}>
          {running
            .filter((app) => !taken.has(app))
            .map((app) => (
              <option key={app} value={app} />
            ))}
        </datalist>
        <span id={`${id}-hint`} className="hint">
          {t("appRules.appHint")}
        </span>
      </div>
      <div className="form-row">
        <label className="field">
          <span>{t("appRules.style")}</span>
          <StyleSelect styles={data.styles} value={styleId} onChange={setStyleId} />
        </label>
        <label className="field">
          <span>{t("appRules.keystroke")}</span>
          <KeystrokeSelect value={keystroke} onChange={setKeystroke} />
        </label>
      </div>
      <ErrorLine message={error} />
      <div className="form-actions">
        <button type="submit" className={buttonClass()} disabled={busy}>
          {t("appRules.add")}
        </button>
      </div>
    </form>
  );
}

function RuleRow({
  rule,
  styles,
  onChanged,
  onDeleted,
}: {
  rule: AppRule;
  styles: Style[];
  onChanged: (rule: AppRule) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState<{ styleId: string; keystroke: ChosenKeystroke } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    const { styleId, keystroke } = editing;
    api
      .updateAppRule(rule.id, { keystroke, ...(styleId !== "" && { styleId }) })
      .then((changed) => {
        onChanged(changed);
        setEditing(null);
      })
      .catch((reason: unknown) => {
        setError(apiProblem(reason));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <li className="item">
      <div className="item-main">
        <p className="item-title mono">{rule.appId}</p>
        {editing === null ? (
          <p className="item-meta">
            {styleLabel(rule.styleId, styles)} · {t(keystrokeLabels[rule.keystroke])}
          </p>
        ) : (
          <form className="inline-form" onSubmit={save}>
            <StyleSelect
              label={t("appRules.style")}
              styles={styles}
              value={editing.styleId}
              onChange={(styleId) => {
                setEditing({ ...editing, styleId });
              }}
            />
            <KeystrokeSelect
              label={t("appRules.keystroke")}
              value={editing.keystroke}
              onChange={(keystroke) => {
                setEditing({ ...editing, keystroke });
              }}
            />
            <span className="inline-buttons">
              <button type="submit" className={buttonClass({ size: "sm" })} disabled={busy}>
                {t("common.save")}
              </button>
              <button
                type="button"
                className={buttonClass({ variant: "secondary", size: "sm" })}
                onClick={() => {
                  setEditing(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </span>
          </form>
        )}
        <ErrorLine message={error} />
      </div>
      {editing === null && (
        <div className="item-actions">
          <button
            type="button"
            className={buttonClass({ variant: "secondary", size: "sm" })}
            onClick={() => {
              setEditing({ styleId: rule.styleId ?? "", keystroke: chosen(rule.keystroke) });
            }}
          >
            {t("common.edit")}
          </button>
          <ConfirmDelete
            onConfirm={() =>
              api.deleteAppRule(rule.id).then(onDeleted, (reason: unknown) => {
                setError(apiProblem(reason));
              })
            }
          />
        </div>
      )}
    </li>
  );
}

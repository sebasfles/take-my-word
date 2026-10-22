import { type DictionaryTerm, dictionaryLimits, normalizeTerm } from "@take-my-word/shared";
import { type SubmitEvent, useEffect, useId, useRef, useState } from "react";
import { api } from "../../api.ts";
import { apiProblem, formatDate, type Note, note, splitAliases } from "../../editing.ts";
import { t } from "../../i18n.ts";
import { ConfirmDelete, ErrorLine, LoadState, SectionPage, useLoaded } from "./parts.tsx";

const loadTerms = () => api.listTerms().then((list) => list.terms);

const tooLong = (text: string) =>
  text.replace(/\s+/g, " ").trim().length > dictionaryLimits.termLength;

function checkAliases(aliases: string[]): Note | null {
  if (aliases.some(tooLong)) {
    return note("dictionary.tooLong", { max: dictionaryLimits.termLength });
  }
  if (aliases.length > dictionaryLimits.aliasesPerTerm) {
    return note("dictionary.tooManyAliases", { max: dictionaryLimits.aliasesPerTerm });
  }
  return null;
}

function checkTerm(term: string, aliases: string[], count: number): Note | null {
  if (term.trim() === "") return note("dictionary.termRequired");
  if (tooLong(term)) return note("dictionary.tooLong", { max: dictionaryLimits.termLength });
  if (count >= dictionaryLimits.terms)
    return note("dictionary.full", { max: dictionaryLimits.terms });
  return checkAliases(aliases);
}

const conflict = note("dictionary.duplicate");
const full = note("dictionary.full", { max: dictionaryLimits.terms });

const sorted = (terms: DictionaryTerm[]) =>
  [...terms].sort((a, b) => normalizeTerm(a.term).localeCompare(normalizeTerm(b.term)));

export function Dictionary({ focusAdd }: { focusAdd: number }) {
  const { state, retry, update } = useLoaded(loadTerms);
  const terms = state.kind === "ready" ? state.data : null;

  return (
    <SectionPage title="settings.dictionary" intro="dictionary.intro">
      <AddTerm
        focus={focusAdd}
        count={terms?.length ?? 0}
        disabled={terms === null}
        onAdded={(term) => {
          update((current) => sorted([...current, term]));
        }}
      />
      <LoadState state={state} onRetry={retry} />
      {terms && (
        <section className="list-section">
          <p className="muted">
            {t("common.count", { count: terms.length, max: dictionaryLimits.terms })}
          </p>
          {terms.length === 0 ? (
            <p className="empty">{t("dictionary.empty")}</p>
          ) : (
            <ul className="list">
              {terms.map((term) => (
                <TermRow
                  key={term.id}
                  term={term}
                  onChanged={(changed) => {
                    update((current) =>
                      current.map((item) => (item.id === changed.id ? changed : item)),
                    );
                  }}
                  onDeleted={() => {
                    update((current) => current.filter((item) => item.id !== term.id));
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

function AddTerm({
  focus,
  count,
  disabled,
  onAdded,
}: {
  focus: number;
  count: number;
  disabled: boolean;
  onAdded: (term: DictionaryTerm) => void;
}) {
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (focus > 0) input.current?.focus();
  }, [focus]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = splitAliases(aliases);
    const problem = checkTerm(term, parsed, count);
    setError(problem);
    if (problem) return;
    setBusy(true);
    api
      .addTerm({ term, aliases: parsed })
      .then((added) => {
        onAdded(added);
        setTerm("");
        setAliases("");
        input.current?.focus();
      })
      .catch((reason: unknown) => {
        setError(apiProblem(reason, { conflict, limit: full }));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="form card" onSubmit={submit} noValidate>
      <div className="form-row">
        <label className="field">
          <span>{t("dictionary.term")}</span>
          <input
            ref={input}
            className="input"
            name="term"
            autoComplete="off"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
            }}
          />
        </label>
        <div className="field">
          <label htmlFor={`${id}-field`}>{t("dictionary.aliases")}</label>
          <input
            id={`${id}-field`}
            className="input"
            name="aliases"
            autoComplete="off"
            aria-describedby={`${id}-hint`}
            value={aliases}
            onChange={(event) => {
              setAliases(event.target.value);
            }}
          />
          <span id={`${id}-hint`} className="hint">
            {t("dictionary.aliasesHint", { max: dictionaryLimits.aliasesPerTerm })}
          </span>
        </div>
      </div>
      <ErrorLine message={error} />
      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={busy || disabled}>
          {t("dictionary.add")}
        </button>
      </div>
    </form>
  );
}

function TermRow({
  term,
  onChanged,
  onDeleted,
}: {
  term: DictionaryTerm;
  onChanged: (term: DictionaryTerm) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const aliases = splitAliases(editing ?? "");
    const problem = checkAliases(aliases);
    setError(problem);
    if (problem) return;
    setBusy(true);
    api
      .updateTerm(term.id, { aliases })
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

  const remove = () =>
    api.deleteTerm(term.id).then(onDeleted, (reason: unknown) => {
      setError(apiProblem(reason));
    });

  return (
    <li className="item">
      <div className="item-main">
        <p className="item-title">{term.term}</p>
        {editing === null ? (
          <p className="chips">
            {term.aliases.length === 0 ? (
              <span className="muted">{t("dictionary.noAliases")}</span>
            ) : (
              term.aliases.map((alias) => (
                <span key={alias} className="chip">
                  {alias}
                </span>
              ))
            )}
          </p>
        ) : (
          <form className="inline-form" onSubmit={save} noValidate>
            <input
              className="input"
              aria-label={t("dictionary.aliases")}
              autoFocus
              value={editing}
              onChange={(event) => {
                setEditing(event.target.value);
              }}
            />
            <span className="inline-buttons">
              <button type="submit" className="button button-small button-primary" disabled={busy}>
                {t("common.save")}
              </button>
              <button
                type="button"
                className="button button-small"
                onClick={() => {
                  setEditing(null);
                  setError(null);
                }}
              >
                {t("common.cancel")}
              </button>
            </span>
          </form>
        )}
        <p className="item-meta">
          {t(term.useCount === 1 ? "dictionary.usageOnce" : "dictionary.usage", {
            count: term.useCount,
            date: formatDate(term.lastUsedAt),
          })}
        </p>
        <ErrorLine message={error} />
      </div>
      {editing === null && (
        <div className="item-actions">
          <button
            type="button"
            className="button button-small"
            onClick={() => {
              setEditing(term.aliases.join(", "));
            }}
          >
            {t("common.edit")}
          </button>
          <ConfirmDelete onConfirm={remove} />
        </div>
      )}
    </li>
  );
}

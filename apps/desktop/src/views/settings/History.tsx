import type { HistoryItem, Style } from "@take-my-word/shared";
import { useState } from "react";
import { api } from "../../api.ts";
import { bridge, problemOf } from "../../bridge.ts";
import { apiProblem, formatDate, type Note, note } from "../../editing.ts";
import { t } from "../../i18n.ts";
import { styleLabel } from "../../styleNames.ts";
import { ConfirmDelete, ErrorLine, LoadState, SectionPage, useLoaded } from "./parts.tsx";

interface Data {
  items: HistoryItem[];
  cursor: string | undefined;
  styles: Style[];
}

const loadHistory = async (): Promise<Data> => {
  const [page, styles] = await Promise.all([
    api.listDictations(),
    api.listStyles().then(
      (list) => list.styles,
      () => [],
    ),
  ]);
  return { items: page.items, cursor: page.cursor, styles };
};

export function History() {
  const { state, retry, update } = useLoaded(loadHistory);
  const data = state.kind === "ready" ? state.data : null;
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<Note | null>(null);

  const loadMore = (cursor: string) => {
    setLoadingMore(true);
    setMoreError(null);
    api
      .listDictations(cursor)
      .then((page) => {
        update((current) => ({
          ...current,
          items: [...current.items, ...page.items],
          cursor: page.cursor,
        }));
      })
      .catch((reason: unknown) => {
        setMoreError(apiProblem(reason));
      })
      .finally(() => {
        setLoadingMore(false);
      });
  };

  return (
    <SectionPage title="settings.history" intro="history.intro">
      <LoadState state={state} onRetry={retry} />
      {data &&
        (data.items.length === 0 ? (
          <p className="empty">{t("history.empty")}</p>
        ) : (
          <section className="list-section">
            <ul className="list">
              {data.items.map((item) => (
                <DictationRow
                  key={item.id}
                  item={item}
                  styles={data.styles}
                  onDeleted={() => {
                    update((current) => ({
                      ...current,
                      items: current.items.filter((other) => other.id !== item.id),
                    }));
                  }}
                />
              ))}
            </ul>
            <ErrorLine message={moreError} />
            {data.cursor !== undefined && (
              <div className="form-actions form-actions-center">
                <button
                  type="button"
                  className="button"
                  disabled={loadingMore}
                  onClick={() => {
                    if (data.cursor !== undefined) loadMore(data.cursor);
                  }}
                >
                  {t(loadingMore ? "common.loading" : "history.loadMore")}
                </button>
              </div>
            )}
          </section>
        ))}
    </SectionPage>
  );
}

function DictationRow({
  item,
  styles,
  onDeleted,
}: {
  item: HistoryItem;
  styles: Style[];
  onDeleted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  const copy = () => {
    setError(null);
    bridge.copyText(item.text).then(
      () => {
        setCopied(true);
      },
      (reason: unknown) => {
        setError(note(problemOf(reason).message));
      },
    );
  };

  return (
    <li className="item item-stacked">
      <p className="dictation-text">{item.text}</p>
      {item.raw !== "" && (
        <details className="raw">
          <summary>{t("history.raw")}</summary>
          <p>{item.raw}</p>
        </details>
      )}
      <div className="item-footer">
        <p className="item-meta">
          {styleLabel(item.styleId, styles)} · {formatDate(item.createdAt)} ·{" "}
          {t("history.audio", { seconds: Math.round(item.audioSeconds) })}
        </p>
        <div className="item-actions">
          <button type="button" className="button button-small" onClick={copy}>
            {t(copied ? "history.copied" : "history.copy")}
          </button>
          <ConfirmDelete
            onConfirm={() =>
              api.deleteDictation(item.id).then(onDeleted, (reason: unknown) => {
                setError(apiProblem(reason));
              })
            }
          />
        </div>
      </div>
      <ErrorLine message={error} />
    </li>
  );
}

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { buttonClass, EmptyState, Skeleton, Waveform } from "@take-my-word/brand";
import { bridge } from "../../bridge.ts";
import { apiProblem, type Note, say } from "../../editing.ts";
import { type MessageId, t } from "../../i18n.ts";

export function SectionPage({
  title,
  intro,
  wide = false,
  children,
}: {
  title: MessageId;
  intro: MessageId;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <main className={wide ? "section section-wide" : "section"}>
      <header className="section-header">
        <h1>{t(title)}</h1>
        <p>{t(intro)}</p>
      </header>
      {children}
    </main>
  );
}

export type Loaded<T> =
  { kind: "loading" } | { kind: "failed"; message: Note } | { kind: "ready"; data: T };

export function useLoaded<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Loaded<T>>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    load()
      .then((data) => {
        if (current) setState({ kind: "ready", data });
      })
      .catch((reason: unknown) => {
        if (current) setState({ kind: "failed", message: apiProblem(reason) });
      });
    return () => {
      current = false;
    };
  }, [load, attempt]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((count) => count + 1);
  }, []);

  const update = useCallback((change: (data: T) => T) => {
    setState((current) =>
      current.kind === "ready" ? { kind: "ready", data: change(current.data) } : current,
    );
  }, []);

  return { state, retry, update };
}

export function LoadState({ state, onRetry }: { state: Loaded<unknown>; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <div className="loading" role="status">
        <span className="visually-hidden">{t("common.loading")}</span>
        <Skeleton lines={3} width="100%" />
      </div>
    );
  }
  if (state.kind === "failed") {
    const signedOut = state.message.id === "account.sessionEnded";
    return (
      <div className="failure" role="alert">
        <p>{say(state.message)}</p>
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          onClick={signedOut ? () => void bridge.openSignIn() : onRetry}
        >
          {t(signedOut ? "settings.account.signIn" : "common.tryAgain")}
        </button>
      </div>
    );
  }
  return null;
}

export function Empty({ title, body }: { title: MessageId; body: MessageId }) {
  return <EmptyState icon={<Waveform level={0.2} bars={5} />} title={t(title)} body={t(body)} />;
}

export function ConfirmDelete({
  question = "common.confirmDelete",
  onConfirm,
}: {
  question?: MessageId;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className={buttonClass({ variant: "secondary", size: "sm" })}
        onClick={() => {
          setAsking(true);
        }}
      >
        {t("common.delete")}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={t(question)}>
      <span className="confirm-question">{t(question)}</span>
      <button
        type="button"
        className={buttonClass({ variant: "danger", size: "sm" })}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onConfirm().finally(() => {
            setBusy(false);
            setAsking(false);
          });
        }}
      >
        {t("common.delete")}
      </button>
      <button
        type="button"
        className={buttonClass({ variant: "secondary", size: "sm" })}
        disabled={busy}
        onClick={() => {
          setAsking(false);
        }}
      >
        {t("common.cancel")}
      </button>
    </span>
  );
}

export function ErrorLine({ message }: { message: Note | null }) {
  if (message === null) return null;
  return (
    <p className="tmw-error" role="alert">
      {say(message)}
    </p>
  );
}

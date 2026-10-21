import type { ReactNode } from "react";
import type { Loaded } from "@/lib/api.ts";
import type { AppData } from "@/lib/gate.ts";
import type { Dictionary } from "@/lib/i18n.ts";
import { ErrorState } from "./error-state.tsx";
import { RenewSession } from "./renew-session.tsx";

export function AccountSection<T>(props: {
  t: Dictionary;
  title: string;
  intro?: string;
  data: AppData<Loaded<T>>;
  children: (value: T) => ReactNode;
}) {
  const { data, t } = props;
  return (
    <section className="section-page" aria-labelledby="section-title">
      <header className="section-header">
        <h1 id="section-title">{props.title}</h1>
        {props.intro !== undefined && <p>{props.intro}</p>}
      </header>
      {data.kind === "renew" ? (
        <RenewSession t={t.renew} />
      ) : data.data.kind === "failed" ? (
        <ErrorState t={t.state} />
      ) : (
        props.children(data.data.value)
      )}
    </section>
  );
}

export function EmptyState(props: { text: string }) {
  return (
    <p className="card state-card empty-state" data-testid="empty-state">
      {props.text}
    </p>
  );
}

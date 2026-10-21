import type { ReactNode } from "react";
import { EmptyState as BrandEmptyState, Waveform } from "@take-my-word/brand";
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

export function EmptyState(props: { title: string; text: string }) {
  return (
    <BrandEmptyState
      testId="empty-state"
      icon={<Waveform level={0.2} bars={5} />}
      title={props.title}
      body={props.text}
    />
  );
}

import type { ReactNode } from "react";
import { Button, Wordmark } from "@take-my-word/brand";
import { type MessageId, t } from "../../i18n.ts";
import type { Flow } from "./Onboarding.tsx";

export function Frame({
  flow,
  title,
  intro,
  visual,
  actions,
  children,
}: {
  flow: Flow;
  title: ReactNode;
  intro?: ReactNode;
  visual?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <Wordmark height={22} className="onboarding-brand" />
        {flow.count > 1 && (
          <div className="onboarding-progress">
            <span>{t("onboarding.progress", { step: flow.position, count: flow.count })}</span>
            <span className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: flow.count }, (_, index) => (
                <span key={index} data-done={index < flow.position ? "" : undefined} />
              ))}
            </span>
          </div>
        )}
      </header>
      <main className={visual === undefined ? "onboarding-frame" : "onboarding-frame split"}>
        <section className="onboarding-content">
          <header className="onboarding-heading">
            <h1>{title}</h1>
            {intro !== undefined && <p>{intro}</p>}
          </header>
          {children}
          {actions !== undefined && <footer className="onboarding-actions">{actions}</footer>}
        </section>
        {visual !== undefined && <div className="onboarding-visual">{visual}</div>}
      </main>
    </div>
  );
}

export function Actions({
  flow,
  label,
  disabled = false,
}: {
  flow: Flow;
  label?: MessageId;
  disabled?: boolean;
}) {
  const text = label ?? (flow.last ? "onboarding.finish" : "onboarding.next");
  return (
    <>
      {flow.canGoBack && (
        <Button variant="ghost" onClick={flow.back}>
          {t("onboarding.back")}
        </Button>
      )}
      <Button onClick={flow.next} loading={flow.busy} disabled={disabled}>
        {t(flow.busy ? "common.saving" : text)}
      </Button>
    </>
  );
}

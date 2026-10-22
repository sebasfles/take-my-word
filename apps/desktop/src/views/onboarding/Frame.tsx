import type { ReactNode } from "react";
import { Wordmark } from "@take-my-word/brand";
import { t } from "../../i18n.ts";

export function Frame({
  step,
  count,
  title,
  intro,
  wide = false,
  actions,
  children,
}: {
  step: number;
  count: number;
  title: ReactNode;
  intro?: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="onboarding">
      <header className="onboarding-top">
        <Wordmark height={22} className="onboarding-brand" />
        {count > 1 && (
          <div className="onboarding-progress">
            <span>{t("onboarding.progress", { step, count })}</span>
            <span className="onboarding-dots" aria-hidden="true">
              {Array.from({ length: count }, (_, index) => (
                <span key={index} data-done={index < step ? "" : undefined} />
              ))}
            </span>
          </div>
        )}
      </header>
      <main className={wide ? "onboarding-card onboarding-card-wide" : "onboarding-card"}>
        <header className="onboarding-heading">
          <h1>{title}</h1>
          {intro !== undefined && <p>{intro}</p>}
        </header>
        {children}
        {actions !== undefined && <footer className="onboarding-actions">{actions}</footer>}
      </main>
    </div>
  );
}

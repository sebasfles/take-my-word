import { useEffect, useState } from "react";
import { Button } from "@take-my-word/brand";
import { type UserContext, userContextSchema } from "@take-my-word/shared";
import { api } from "../../api.ts";
import { apiProblem, type Note } from "../../editing.ts";
import { t } from "../../i18n.ts";
import { UserContextChoices } from "../../UserContextChoices.tsx";
import { ErrorLine } from "./parts.tsx";

const same = (a: UserContext, b: UserContext) =>
  a.detail.trim() === b.detail && a.picks.join() === b.picks.join();

export function UserContextRow() {
  const [stored, setStored] = useState<UserContext | null>(null);
  const [draft, setDraft] = useState<UserContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<Note | null>(null);

  useEffect(() => {
    api.getSettings().then(
      (settings) => {
        setStored(settings.context);
        setDraft(settings.context);
      },
      (reason: unknown) => {
        setError(apiProblem(reason));
      },
    );
  }, []);

  const save = (context: UserContext) => {
    setBusy(true);
    setSaved(false);
    setError(null);
    api
      .getSettings()
      .then((settings) =>
        api.replaceSettings({ ...settings, context: userContextSchema.parse(context) }),
      )
      .then((settings) => {
        setStored(settings.context);
        setDraft(settings.context);
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
    <section className="setting setting-stacked">
      <div className="setting-text">
        <h2 className="setting-title">{t("settings.context")}</h2>
        <p className="setting-note">{t("settings.context.note")}</p>
        {saved && (
          <p className="setting-note" role="status">
            {t("common.saved")}
          </p>
        )}
        <ErrorLine message={error} />
      </div>
      {draft && stored && (
        <>
          <UserContextChoices
            value={draft}
            onChange={(next) => {
              setSaved(false);
              setDraft(next);
            }}
            disabled={busy}
          />
          <div className="setting-actions">
            <Button
              size="sm"
              loading={busy}
              disabled={same(draft, stored)}
              onClick={() => {
                save(draft);
              }}
            >
              {t(busy ? "common.saving" : "common.save")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

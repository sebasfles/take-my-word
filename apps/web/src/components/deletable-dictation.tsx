"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { deleteDictation } from "@/lib/delete-dictation.ts";
import type { Dictionary } from "@/lib/i18n.ts";

type Phase = "idle" | "confirm" | "deleting" | "failed" | "deleted";

export function DeletableDictation(props: {
  id: string;
  t: Dictionary["history"];
  meta: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const { t } = props;

  async function confirmDelete() {
    setPhase("deleting");
    const outcome = await deleteDictation(props.id);
    if (outcome === "signed-out") {
      router.replace("/sign-in");
      return;
    }
    if (outcome === "failed") {
      setPhase("failed");
      return;
    }
    setPhase("deleted");
    router.refresh();
  }

  if (phase === "deleted") return null;

  return (
    <li className="card dictation" data-testid="dictation">
      {props.children}
      <div className="dictation-footer">
        {props.meta}
        <div className="dictation-actions">
          {phase === "confirm" || phase === "deleting" ? (
            <div className="confirm" role="group" aria-label={t.confirm}>
              <p>{t.confirm}</p>
              <div className="confirm-buttons">
                <button
                  type="button"
                  className="button button-danger"
                  disabled={phase === "deleting"}
                  onClick={() => void confirmDelete()}
                >
                  {phase === "deleting" ? t.deleting : t.confirmDelete}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={phase === "deleting"}
                  onClick={() => {
                    setPhase("idle");
                  }}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <>
              {phase === "failed" && (
                <p role="alert" className="form-error">
                  {t.deleteFailed}
                </p>
              )}
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => {
                  setPhase("confirm");
                }}
              >
                {t.delete}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

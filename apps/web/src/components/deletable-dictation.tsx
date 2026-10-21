"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@take-my-word/brand";
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
    <li className="dictation" data-testid="dictation">
      {props.children}
      <div className="dictation-footer">
        {props.meta}
        <div className="dictation-actions">
          {phase === "confirm" || phase === "deleting" ? (
            <div className="confirm" role="group" aria-label={t.confirm}>
              <p>{t.confirm}</p>
              <div className="confirm-buttons">
                <Button
                  variant="danger"
                  size="sm"
                  loading={phase === "deleting"}
                  onClick={() => void confirmDelete()}
                >
                  {phase === "deleting" ? t.deleting : t.confirmDelete}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={phase === "deleting"}
                  onClick={() => {
                    setPhase("idle");
                  }}
                >
                  {t.cancel}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {phase === "failed" && (
                <p role="alert" className="form-error">
                  {t.deleteFailed}
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPhase("confirm");
                }}
              >
                {t.delete}
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

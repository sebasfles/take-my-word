"use client";

import type { ReactNode } from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: ReactNode;
}

export function ToastRegion({
  toasts,
  onDismiss,
  label,
  dismissLabel,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  label: string;
  dismissLabel: string;
}) {
  return (
    <section className="tmw-toasts" aria-label={label}>
      <div role="status" aria-live="polite" className="tmw-toasts-list">
        {toasts
          .filter((toast) => toast.tone !== "error")
          .map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={onDismiss} dismissLabel={dismissLabel} />
          ))}
      </div>
      <div role="alert" className="tmw-toasts-list">
        {toasts
          .filter((toast) => toast.tone === "error")
          .map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={onDismiss} dismissLabel={dismissLabel} />
          ))}
      </div>
    </section>
  );
}

function Toast({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  return (
    <div className="tmw-toast" data-tone={toast.tone}>
      <p className="tmw-toast-message">{toast.message}</p>
      <button
        type="button"
        className="tmw-toast-dismiss"
        aria-label={dismissLabel}
        onClick={() => {
          onDismiss(toast.id);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

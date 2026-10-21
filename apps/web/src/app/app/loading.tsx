"use client";

import { useStateStrings } from "@/components/state-strings.tsx";

export default function AccountLoading() {
  const t = useStateStrings();
  return (
    <div className="state-loading" aria-busy="true" data-testid="loading-state">
      <p className="visually-hidden" role="status">
        {t.loading}
      </p>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-block" />
    </div>
  );
}

"use client";

import { Skeleton } from "@take-my-word/brand";
import { useStateStrings } from "@/components/state-strings.tsx";

export default function AccountLoading() {
  const t = useStateStrings();
  return (
    <div className="state-loading" aria-busy="true" data-testid="loading-state">
      <p className="visually-hidden" role="status">
        {t.loading}
      </p>
      <Skeleton className="skeleton-title" />
      <Skeleton width="70%" />
      <div className="skeleton-cards">
        <Skeleton lines={3} className="skeleton-card" />
        <Skeleton lines={3} className="skeleton-card" />
        <Skeleton lines={2} className="skeleton-card" />
      </div>
    </div>
  );
}

import type { CSSProperties, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "error" | "info";

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className === undefined ? "tmw-badge" : `tmw-badge ${className}`}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
  testId,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="tmw-empty" data-testid={testId}>
      {icon === undefined ? null : (
        <div className="tmw-empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="tmw-empty-title">{title}</p>
      {body === undefined ? null : <p className="tmw-empty-body">{body}</p>}
      {action === undefined ? null : <div className="tmw-empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({
  lines = 1,
  width,
  className,
}: {
  lines?: number;
  width?: string;
  className?: string;
}) {
  return (
    <span
      className={className === undefined ? "tmw-skeleton" : `tmw-skeleton ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="tmw-skeleton-line"
          style={
            width === undefined
              ? undefined
              : ({
                  "--skeleton-width": index === lines - 1 && lines > 1 ? "60%" : width,
                } as CSSProperties)
          }
        />
      ))}
    </span>
  );
}

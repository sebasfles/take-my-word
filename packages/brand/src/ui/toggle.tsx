"use client";

import { useId, type ReactNode } from "react";

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  className,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={className === undefined ? "tmw-toggle" : `tmw-toggle ${className}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="tmw-toggle-track"
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="tmw-toggle-thumb" aria-hidden="true" />
      </button>
      <label htmlFor={id} className="tmw-toggle-label">
        {label}
      </label>
    </span>
  );
}

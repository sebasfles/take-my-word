import type { ReactNode } from "react";
import { Waveform } from "../waveform.tsx";

export type OverlayState = "listening" | "processing" | "done" | "error";

export function OverlayPill({
  state,
  label,
  level,
  bars = 5,
  className,
}: {
  state: OverlayState;
  label: ReactNode;
  level?: number;
  bars?: number;
  className?: string;
}) {
  const voice =
    state === "listening"
      ? level === undefined
        ? ({ demo: true } as const)
        : { level }
      : { level: state === "processing" ? 0.35 : 0 };
  return (
    <span
      className={className === undefined ? "tmw-overlay" : `tmw-overlay ${className}`}
      data-state={state}
      role="status"
    >
      <Waveform bars={bars} {...voice} />
      <span className="tmw-overlay-label">{label}</span>
    </span>
  );
}

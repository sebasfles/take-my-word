import type { ReactNode } from "react";
import { Icon } from "../icons.tsx";
import { Waveform, type WaveformProps } from "../waveform.tsx";

export type OverlayState = "listening" | "processing" | "done" | "error";
export type OverlayIndicator = "waveform" | "state";

function voiceOf(
  state: OverlayState,
  level: number | undefined,
  levels: readonly number[] | undefined,
  bars: number,
): WaveformProps {
  if (state !== "listening") return { level: state === "processing" ? 0.35 : 0, bars };
  if (levels !== undefined) return { levels };
  return level === undefined ? { demo: true, bars } : { level, bars };
}

function StateIndicator({ state }: { state: Exclude<OverlayState, "listening"> }) {
  if (state === "processing") return <span className="tmw-spinner" aria-hidden="true" />;
  return <Icon name={state === "error" ? "alert" : "check"} className="tmw-overlay-glyph" />;
}

export function OverlayPill({
  state,
  label,
  level,
  levels,
  bars = 5,
  indicator = "waveform",
  action,
  className,
}: {
  state: OverlayState;
  label: ReactNode;
  level?: number;
  levels?: readonly number[];
  bars?: number;
  indicator?: OverlayIndicator;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className === undefined ? "tmw-overlay" : `tmw-overlay ${className}`}
      data-state={state}
      role={state === "error" ? "alert" : "status"}
    >
      {indicator === "state" && state !== "listening" ? (
        <StateIndicator state={state} />
      ) : (
        <Waveform {...voiceOf(state, level, levels, bars)} />
      )}
      <span className="tmw-overlay-label">{label}</span>
      {action}
    </span>
  );
}

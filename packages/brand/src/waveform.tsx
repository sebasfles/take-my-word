import type { CSSProperties } from "react";

const profile = [0.38, 0.62, 0.86, 1, 0.74, 0.92, 0.56, 0.34];

export type WaveformProps = {
  bars?: number;
  className?: string;
} & ({ level: number } | { demo: true });

export function Waveform(props: WaveformProps) {
  const count = props.bars ?? 5;
  const live = "level" in props;
  const level = live ? Math.min(1, Math.max(0, props.level)) : 1;
  return (
    <span
      className={props.className === undefined ? "waveform" : `waveform ${props.className}`}
      data-mode={live ? "level" : "demo"}
      style={{ "--level": level } as CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="waveform-bar"
          style={
            {
              "--i": index,
              "--weight":
                profile[Math.round((index * (profile.length - 1)) / Math.max(1, count - 1))],
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

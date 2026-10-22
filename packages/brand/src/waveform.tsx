import type { CSSProperties } from "react";

const profile = [0.38, 0.62, 0.86, 1, 0.74, 0.92, 0.56, 0.34];

export type WaveformProps = {
  bars?: number;
  className?: string;
} & ({ level: number } | { demo: true } | { levels: readonly number[] });

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function Waveform(props: WaveformProps) {
  const history = "levels" in props ? props.levels.map(clamp) : null;
  const count = history?.length ?? props.bars ?? 5;
  const live = "level" in props;
  const level = live ? clamp(props.level) : 1;
  const mode = history !== null ? "history" : live ? "level" : "demo";
  return (
    <span
      className={props.className === undefined ? "waveform" : `waveform ${props.className}`}
      data-mode={mode}
      style={history === null ? ({ "--level": level } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="waveform-bar"
          style={
            history === null
              ? ({
                  "--i": index,
                  "--weight":
                    profile[Math.round((index * (profile.length - 1)) / Math.max(1, count - 1))],
                } as CSSProperties)
              : ({ "--i": index, "--weight": 1, "--level": history[index] } as CSSProperties)
          }
        />
      ))}
    </span>
  );
}

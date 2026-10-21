import { bar, Svg, type MarkProps } from "../svg.tsx";

const glyph = [
  "M6 39C6 26.5 11.4 16.6 23 11.2C18.6 16.4 16.3 21.6 16.6 28.1A10.5 10.5 0 1 1 6 39Z",
  bar(32, 31, 7, 22),
  bar(42.5, 31, 7, 40),
  bar(53, 31, 7, 14),
].join("");

export function Mark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path d={glyph} fill="currentColor" />
    </Svg>
  );
}

export function AppIcon(props: MarkProps) {
  return (
    <Svg {...props}>
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <g transform="translate(5.5 4.5) scale(0.83)">
        <path d={glyph} fill="var(--color-on-accent)" />
      </g>
    </Svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className === undefined ? "wordmark" : `wordmark ${className}`}>
      Take My <em>Word</em>
    </span>
  );
}

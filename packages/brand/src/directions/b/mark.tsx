import { bar, Svg, type MarkProps } from "../svg.tsx";

const bubble =
  "M18 7H46A14 14 0 0 1 60 21V33A14 14 0 0 1 46 47H30L14 58.5L18 47A14 14 0 0 1 4 33V21A14 14 0 0 1 18 7Z";
const bars = [
  bar(15, 27, 5.5, 10),
  bar(24.5, 27, 5.5, 24),
  bar(34, 27, 5.5, 17),
  bar(43.5, 27, 5.5, 9),
];

export function Mark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path d={bubble + bars.join("")} fill="currentColor" fillRule="evenodd" />
    </Svg>
  );
}

export function ColorMark(props: MarkProps) {
  return (
    <Svg {...props}>
      <path d={bubble} fill="var(--color-accent)" />
      <path d={bars.join("")} fill="var(--color-on-accent)" />
    </Svg>
  );
}

export function AppIcon(props: MarkProps) {
  return (
    <Svg {...props}>
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <g transform="translate(6.4 7) scale(0.8)">
        <path d={bubble + bars.join("")} fill="var(--color-on-accent)" fillRule="evenodd" />
      </g>
    </Svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className === undefined ? "wordmark" : `wordmark ${className}`}>
      take my word
    </span>
  );
}

import { Svg, type MarkProps } from "../svg.tsx";

const comma = "M28 26C28 38 22.4 46.4 10.6 50.6C15.6 45.6 18.4 40.6 18.6 35A9 9 0 1 1 28 26Z";
const ripple = (radius: number) => {
  const angle = (42 * Math.PI) / 180;
  const dx = (radius * Math.cos(angle)).toFixed(2);
  const dy = (radius * Math.sin(angle)).toFixed(2);
  return `M${19 + Number(dx)} ${26 - Number(dy)}A${radius} ${radius} 0 0 1 ${19 + Number(dx)} ${26 + Number(dy)}`;
};

function Glyph() {
  return (
    <g transform="translate(1 4)">
      <path d={comma} fill="currentColor" />
      <path
        d={`${ripple(19)}${ripple(31)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </g>
  );
}

export function Mark(props: MarkProps) {
  return (
    <Svg {...props}>
      <Glyph />
    </Svg>
  );
}

export function AppIcon(props: MarkProps) {
  return (
    <Svg {...props}>
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <g transform="translate(7 6) scale(0.8)" color="var(--color-on-accent)">
        <Glyph />
      </g>
    </Svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={className === undefined ? "wordmark" : `wordmark ${className}`}>
      Take <em>my</em> Word
    </span>
  );
}

import { glyph, glyphInTile, glyphSmall, smallUpTo } from "./mark-geometry.ts";
import { wordmark } from "./wordmark-paths.ts";

export interface MarkProps {
  size: number;
  title?: string;
  className?: string;
}

function a11y(title: string | undefined) {
  return title === undefined
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": title } as const);
}

export function Mark({ size, title, className }: MarkProps) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} {...a11y(title)}>
      <path d={size <= smallUpTo ? glyphSmall : glyph} fill="currentColor" />
    </svg>
  );
}

export function AppIcon({ size, title, className }: MarkProps) {
  const small = size <= smallUpTo;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} {...a11y(title)}>
      <rect width="64" height="64" rx="15" fill="var(--color-accent)" />
      <path
        d={small ? glyphSmall : glyph}
        transform={small ? undefined : glyphInTile}
        fill="var(--color-on-accent)"
      />
    </svg>
  );
}

export function Wordmark({
  height,
  title = "Take My Word",
  className,
}: {
  height: number;
  title?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={wordmark.viewBox}
      height={height}
      width={(height * wordmark.width) / wordmark.height}
      className={className === undefined ? "wordmark" : `wordmark ${className}`}
      {...a11y(title)}
    >
      <path
        d={height <= smallUpTo ? glyphSmall : glyph}
        transform={wordmark.mark}
        fill="var(--color-accent)"
      />
      <path d={wordmark.roman} fill="currentColor" />
      <path d={wordmark.italic} fill="var(--color-accent-text)" />
    </svg>
  );
}

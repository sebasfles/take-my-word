import type { ReactNode } from "react";

export function bar(x: number, center: number, width: number, height: number): string {
  const r = width / 2;
  const top = center - height / 2;
  const bottom = center + height / 2;
  return `M${x} ${top + r}a${r} ${r} 0 0 1 ${width} 0V${bottom - r}a${r} ${r} 0 0 1 ${-width} 0Z`;
}

export interface MarkProps {
  size: number;
  title?: string;
  className?: string;
}

export function Svg(props: MarkProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={props.size}
      height={props.size}
      className={props.className}
      role={props.title === undefined ? undefined : "img"}
      aria-hidden={props.title === undefined ? true : undefined}
    >
      {props.title === undefined ? null : <title>{props.title}</title>}
      {props.children}
    </svg>
  );
}

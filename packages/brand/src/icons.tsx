export const icons = {
  general: "M2.75 4.5h5M11.25 4.5h2M2.75 11.5h2M8.25 11.5h5M9.25 3v3M6.25 10v3",
  account:
    "M8 8.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM2.75 13.75c.6-2.4 2.6-3.75 5.25-3.75s4.65 1.35 5.25 3.75",
  dictionary: "M3 2.75h7.5a2 2 0 0 1 2 2v8.5H5a2 2 0 0 1-2-2zM3 11.25a2 2 0 0 1 2-2h7.5M6 5.5h4",
  styles: "M3 13h10M4.5 10.5l3.5-8 3.5 8M5.6 8h4.8",
  rules: "M2.75 4.5h6.5M2.75 8h4.5M2.75 11.5h6.5M11 3v3M11 10v3M12.75 8h.5",
  history: "M8 4.75V8l2 1.5M2.75 8a5.25 5.25 0 1 0 1.6-3.8M2.75 2.75v2.5h2.5",
  system: "M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3",
  light:
    "M8 5.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  dark: "M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z",
  alert: "M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5zM8 4.75v3.75M8 11v.25",
  check: "M3.5 8.5l3 3 6-6.5",
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d={icons[name]} />
    </svg>
  );
}

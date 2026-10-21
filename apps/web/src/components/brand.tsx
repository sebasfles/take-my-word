import Link from "next/link";

export function Brand({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <Link href={href} className={compact ? "brand brand-compact" : "brand"}>
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" />
        <g>
          <rect x="7" y="12" width="3" height="8" rx="1.5" />
          <rect x="12" y="8" width="3" height="16" rx="1.5" />
          <rect x="17" y="10" width="3" height="12" rx="1.5" />
          <rect x="22" y="13" width="3" height="6" rx="1.5" />
        </g>
      </svg>
      <span>Take My Word</span>
    </Link>
  );
}

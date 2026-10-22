import Link from "next/link";
import { Wordmark } from "@take-my-word/brand";

export function Brand({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="brand">
      <Wordmark height={26} title={label} className="brand-wordmark" />
    </Link>
  );
}

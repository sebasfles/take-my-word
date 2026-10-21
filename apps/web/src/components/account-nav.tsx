"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AccountNav(props: {
  label: string;
  links: readonly { href: string; text: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="account-nav" aria-label={props.label}>
      <ul>
        {props.links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} aria-current={pathname === link.href ? "page" : undefined}>
              {link.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavItem } from "@take-my-word/brand";

const icons = {
  account:
    "M8 8.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5zM2.75 13.75c.6-2.4 2.6-3.75 5.25-3.75s4.65 1.35 5.25 3.75",
  dictionary: "M3 2.75h7.5a2 2 0 0 1 2 2v8.5H5a2 2 0 0 1-2-2zM3 11.25a2 2 0 0 1 2-2h7.5M6 5.5h4",
  styles: "M3 13h10M4.5 10.5l3.5-8 3.5 8M5.6 8h4.8",
  rules: "M2.75 4.5h6.5M2.75 8h4.5M2.75 11.5h6.5M11 3v3M11 10v3M12.75 8h.5",
  history: "M8 4.75V8l2 1.5M2.75 8a5.25 5.25 0 1 0 1.6-3.8M2.75 2.75v2.5h2.5",
} as const;

export function AccountNav(props: {
  label: string;
  links: readonly { href: string; text: string; icon: keyof typeof icons }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="account-nav" aria-label={props.label}>
      <ul>
        {props.links.map((link) => (
          <li key={link.href}>
            <NavItem href={link.href} current={pathname === link.href} link={Link}>
              <svg viewBox="0 0 16 16" aria-hidden="true" className="account-nav-icon">
                <path d={icons[link.icon]} />
              </svg>
              {link.text}
            </NavItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName, NavItem } from "@take-my-word/brand";

export function AccountNav(props: {
  label: string;
  links: readonly { href: string; text: string; icon: IconName }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="account-nav" aria-label={props.label}>
      <ul>
        {props.links.map((link) => (
          <li key={link.href}>
            <NavItem href={link.href} current={pathname === link.href} link={Link}>
              <Icon name={link.icon} className="account-nav-icon" />
              {link.text}
            </NavItem>
          </li>
        ))}
      </ul>
    </nav>
  );
}

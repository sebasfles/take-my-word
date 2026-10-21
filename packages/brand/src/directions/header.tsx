import type { ReactNode } from "react";
import { copy } from "./copy.ts";

export function Header({ brand }: { brand: ReactNode }) {
  return (
    <header className="d-header">
      <a className="d-brand" href="#top">
        {brand}
      </a>
      <nav className="d-nav" aria-label="Principal">
        {copy.nav.map((item) => (
          <a key={item} className="d-nav-link" href="#top">
            {item}
          </a>
        ))}
        <a className="d-nav-link d-nav-strong" href="#top">
          {copy.signIn}
        </a>
        <span className="d-locale">{copy.locale}</span>
      </nav>
    </header>
  );
}

export function WindowsIcon() {
  return (
    <svg className="d-button-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M0 2.3 6.5 1.4v6.2H0zm7.3-1L16 0v7.6H7.3zM0 8.4h6.5v6.2L0 13.7zm7.3 0H16V16l-8.7-1.2z"
      />
    </svg>
  );
}

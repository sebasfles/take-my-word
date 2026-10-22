"use client";

import { useId, useRef, type ComponentType, type ReactNode } from "react";

export interface Tab {
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

export function Tabs({
  tabs,
  selected,
  onSelect,
  label,
}: {
  tabs: Tab[];
  selected: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function move(from: number, to: number) {
    const count = tabs.length;
    const target = tabs[((to % count) + count) % count];
    if (target === undefined || from === to) return;
    onSelect(target.id);
    refs.current.get(target.id)?.focus();
  }

  const current = tabs.find((tab) => tab.id === selected) ?? tabs[0];

  return (
    <div className="tmw-tabs">
      <div role="tablist" aria-label={label} className="tmw-tablist">
        {tabs.map((tab, index) => {
          const active = tab.id === current?.id;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                if (element === null) refs.current.delete(tab.id);
                else refs.current.set(tab.id, element);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              className="tmw-tab"
              onClick={() => {
                onSelect(tab.id);
              }}
              onKeyDown={(event) => {
                const keys: Record<string, number> = {
                  ArrowRight: index + 1,
                  ArrowLeft: index - 1,
                  Home: 0,
                  End: tabs.length - 1,
                };
                const to = keys[event.key];
                if (to === undefined) return;
                event.preventDefault();
                move(index, to);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {current === undefined ? null : (
        <div
          role="tabpanel"
          id={`${base}-panel-${current.id}`}
          aria-labelledby={`${base}-tab-${current.id}`}
          tabIndex={0}
          className="tmw-tabpanel"
        >
          {current.panel}
        </div>
      )}
    </div>
  );
}

export function navItemClass(current: boolean): string {
  return current ? "tmw-nav-item tmw-nav-item-current" : "tmw-nav-item";
}

export function NavItem({
  href,
  current,
  children,
  link: Link,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
  link?: ComponentType<{
    href: string;
    className: string;
    "aria-current"?: "page";
    children: ReactNode;
  }>;
}) {
  const props = {
    href,
    className: navItemClass(current),
    ...(current && { "aria-current": "page" as const }),
  };
  return Link === undefined ? <a {...props}>{children}</a> : <Link {...props}>{children}</Link>;
}

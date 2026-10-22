import { type ReactNode, useEffect, useRef } from "react";
import { Wordmark } from "@take-my-word/brand";

export function WindowPage({
  title,
  intro,
  onHeight,
  children,
}: {
  title: ReactNode;
  intro: ReactNode;
  onHeight?: (height: number) => void;
  children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = main.current;
    if (!onHeight || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      onHeight(element.getBoundingClientRect().height);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [onHeight]);

  return (
    <main className="window" ref={main}>
      <Wordmark height={24} className="window-brand" />
      <header className="window-heading">
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      {children}
    </main>
  );
}

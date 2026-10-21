"use client";

import Link, { useLinkStatus } from "next/link";
import { buttonClass } from "@take-my-word/brand";

function LoadMoreText(props: { text: string; pendingText: string }) {
  const { pending } = useLinkStatus();
  return <>{pending ? props.pendingText : props.text}</>;
}

export function LoadMore(props: { href: string; text: string; pendingText: string }) {
  return (
    <Link
      href={props.href}
      scroll={false}
      className={buttonClass({ variant: "secondary" }, "load-more")}
    >
      <LoadMoreText text={props.text} pendingText={props.pendingText} />
    </Link>
  );
}

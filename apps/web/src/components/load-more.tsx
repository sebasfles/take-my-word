"use client";

import Link, { useLinkStatus } from "next/link";

function LoadMoreText(props: { text: string; pendingText: string }) {
  const { pending } = useLinkStatus();
  return <>{pending ? props.pendingText : props.text}</>;
}

export function LoadMore(props: { href: string; text: string; pendingText: string }) {
  return (
    <Link href={props.href} scroll={false} className="button button-secondary load-more">
      <LoadMoreText text={props.text} pendingText={props.pendingText} />
    </Link>
  );
}

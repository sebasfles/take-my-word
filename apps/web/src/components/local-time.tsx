"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime } from "@/lib/account.ts";

const subscribe = () => () => undefined;
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

export function LocalTime(props: { value: string; locale: string; withTime?: boolean }) {
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
  const text = props.withTime
    ? formatDateTime(props.value, props.locale, timeZone)
    : formatDate(props.value, props.locale, timeZone);
  return <time dateTime={props.value}>{text}</time>;
}

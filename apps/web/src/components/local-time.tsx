"use client";

import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, formatTime } from "@/lib/account.ts";

const subscribe = () => () => undefined;
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => "UTC";

export function LocalTime(props: {
  value: string;
  locale: string;
  withTime?: boolean;
  timeOnly?: boolean;
}) {
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, serverTimeZone);
  const format = props.timeOnly ? formatTime : props.withTime ? formatDateTime : formatDate;
  const text = format(props.value, props.locale, timeZone);
  return <time dateTime={props.value}>{text}</time>;
}

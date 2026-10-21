import { ApiError } from "./api.ts";
import { language, type MessageId, t } from "./i18n.ts";

export interface Note {
  id: MessageId;
  values?: Record<string, string | number>;
}

export function note(id: MessageId, values?: Record<string, string | number>): Note {
  return values ? { id, values } : { id };
}

export function say(message: Note): string {
  return t(message.id, message.values);
}

export interface Expected {
  conflict?: Note;
  limit?: Note;
}

export function apiProblem(reason: unknown, expected: Expected = {}): Note {
  if (!(reason instanceof ApiError)) return note("error.generic");
  const { kind, status } = reason.failure;
  if (kind === "signedOut") return note("account.sessionEnded");
  if (kind === "network") return note("account.unreachable");
  if (status === 409 && expected.conflict) return expected.conflict;
  if (status === 400 && expected.limit) return expected.limit;
  return note("error.generic");
}

export function splitAliases(text: string): string[] {
  return text
    .split(",")
    .map((alias) => alias.replace(/\s+/g, " ").trim())
    .filter((alias) => alias !== "");
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(language(), { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

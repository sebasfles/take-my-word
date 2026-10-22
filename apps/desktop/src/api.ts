import {
  type ApiErrorCode,
  type AppRuleInput,
  type AppRuleUpdate,
  apiErrorCodes,
  appRuleInputSchema,
  appRuleListSchema,
  appRuleSchema,
  appRuleUpdateSchema,
  type DictionaryTermInput,
  type DictionaryTermUpdate,
  dictionaryListSchema,
  dictionaryTermInputSchema,
  dictionaryTermSchema,
  dictionaryTermUpdateSchema,
  historyPageSchema,
  type Settings,
  type StyleInput,
  settingsSchema,
  styleInputSchema,
  styleListSchema,
  styleSchema,
} from "@take-my-word/shared";
import { z } from "zod";
import { bridge } from "./bridge.ts";

export type Route =
  | { route: "listTerms" }
  | { route: "addTerm"; body: DictionaryTermInput }
  | { route: "updateTerm"; id: string; body: DictionaryTermUpdate }
  | { route: "deleteTerm"; id: string }
  | { route: "listStyles" }
  | { route: "createStyle"; body: StyleInput }
  | { route: "updateStyle"; id: string; body: StyleInput }
  | { route: "deleteStyle"; id: string }
  | { route: "listAppRules" }
  | { route: "createAppRule"; body: AppRuleInput }
  | { route: "updateAppRule"; id: string; body: AppRuleUpdate }
  | { route: "deleteAppRule"; id: string }
  | { route: "getSettings" }
  | { route: "replaceSettings"; body: Settings }
  | { route: "listDictations"; cursor?: string }
  | { route: "deleteDictation"; id: string };

const failureSchema = z.object({
  kind: z.enum(["signedOut", "network", "rejected", "invalidRequest", "invalidResponse"]),
  status: z.number().int().nullable(),
  code: z.enum(apiErrorCodes).nullable(),
});
export type ApiFailure = z.infer<typeof failureSchema>;

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(`api ${failure.kind} ${String(failure.status)}`);
    this.failure = failure;
  }

  is(status: number, code?: ApiErrorCode): boolean {
    return this.failure.status === status && (code === undefined || this.failure.code === code);
  }
}

const local = (kind: "invalidRequest" | "invalidResponse") =>
  new ApiError({ kind, status: null, code: null });

function valid<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw local("invalidRequest");
  return parsed.data;
}

async function call<S extends z.ZodType>(route: () => Route, response: S): Promise<z.output<S>> {
  const request = route();
  let body: unknown;
  try {
    body = await bridge.apiRequest(request);
  } catch (reason) {
    const failure = failureSchema.safeParse(reason);
    throw failure.success ? new ApiError(failure.data) : local("invalidResponse");
  }
  const parsed = response.safeParse(body);
  if (!parsed.success) throw local("invalidResponse");
  return parsed.data;
}

const deleted = z.null();

export const api = {
  listTerms: () => call(() => ({ route: "listTerms" }), dictionaryListSchema),
  addTerm: (term: z.input<typeof dictionaryTermInputSchema>) =>
    call(
      () => ({ route: "addTerm", body: valid(dictionaryTermInputSchema, term) }),
      dictionaryTermSchema,
    ),
  updateTerm: (id: string, update: DictionaryTermUpdate) =>
    call(
      () => ({ route: "updateTerm", id, body: valid(dictionaryTermUpdateSchema, update) }),
      dictionaryTermSchema,
    ),
  deleteTerm: (id: string) => call(() => ({ route: "deleteTerm", id }), deleted),
  listStyles: () => call(() => ({ route: "listStyles" }), styleListSchema),
  createStyle: (style: StyleInput) =>
    call(() => ({ route: "createStyle", body: valid(styleInputSchema, style) }), styleSchema),
  updateStyle: (id: string, style: StyleInput) =>
    call(() => ({ route: "updateStyle", id, body: valid(styleInputSchema, style) }), styleSchema),
  deleteStyle: (id: string) => call(() => ({ route: "deleteStyle", id }), deleted),
  listAppRules: () => call(() => ({ route: "listAppRules" }), appRuleListSchema),
  createAppRule: (rule: AppRuleInput) =>
    call(() => ({ route: "createAppRule", body: valid(appRuleInputSchema, rule) }), appRuleSchema),
  updateAppRule: (id: string, update: AppRuleUpdate) =>
    call(
      () => ({ route: "updateAppRule", id, body: valid(appRuleUpdateSchema, update) }),
      appRuleSchema,
    ),
  deleteAppRule: (id: string) => call(() => ({ route: "deleteAppRule", id }), deleted),
  getSettings: () => call(() => ({ route: "getSettings" }), settingsSchema),
  replaceSettings: (settings: Settings) =>
    call(
      () => ({ route: "replaceSettings", body: valid(settingsSchema, settings) }),
      settingsSchema,
    ),
  listDictations: (cursor?: string) =>
    call(
      () => ({ route: "listDictations", ...(cursor !== undefined && { cursor }) }),
      historyPageSchema,
    ),
  deleteDictation: (id: string) => call(() => ({ route: "deleteDictation", id }), deleted),
};

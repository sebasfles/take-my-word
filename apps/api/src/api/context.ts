import type { Context } from "hono";
import type { z } from "zod";
import type { AuthContext } from "../lib/auth-context.ts";
import { HttpError } from "../lib/http-error.ts";

export interface ApiEnv {
  Bindings: {
    event?: { requestContext?: { authorizer?: { lambda?: Partial<AuthContext> } } };
    lambdaContext?: { awsRequestId?: string };
  };
  Variables: { userId: string };
}

export type ApiContext = Context<ApiEnv>;

export function invalid(error: z.ZodError, where: string): HttpError {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || where;
  return new HttpError("bad_request", `Invalid ${path}: ${issue?.message ?? "invalid value"}.`);
}

export async function readJson<T extends z.ZodType>(
  c: ApiContext,
  schema: T,
): Promise<z.output<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HttpError("bad_request", "The body is not JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw invalid(parsed.error, "body");
  return parsed.data;
}

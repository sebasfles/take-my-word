import { z } from "zod";

export const apiErrorCodes = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "quota_exceeded",
  "provider_failed",
  "internal",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorStatus: Readonly<Record<ApiErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  quota_exceeded: 429,
  provider_failed: 502,
  internal: 500,
};

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(apiErrorCodes),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

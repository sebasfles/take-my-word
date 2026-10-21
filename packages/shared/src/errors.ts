import { z } from "zod";

export const apiErrorCodes = [
  "bad_request",
  "payload_too_large",
  "unsupported_media_type",
  "quota_exceeded",
  "provider_failed",
  "internal",
] as const;
export type ApiErrorCode = (typeof apiErrorCodes)[number];

export const apiErrorStatus: Readonly<Record<ApiErrorCode, number>> = {
  bad_request: 400,
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

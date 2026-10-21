import type { ApiErrorCode } from "@take-my-word/shared";

export class HttpError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
  }
}

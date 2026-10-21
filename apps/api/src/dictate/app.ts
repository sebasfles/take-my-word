import { apiErrorStatus, type ApiError } from "@take-my-word/shared";
import type {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
  Context,
} from "aws-lambda";
import { dictate, type DictateDeps } from "../dictation/dictate.ts";
import { readDictationUpload } from "../dictation/upload.ts";
import type { AuthContext } from "../lib/auth-context.ts";
import { HttpError } from "../lib/http-error.ts";
import { jsonResponse } from "../lib/json-response.ts";

export type DictateEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

function errorResponse(error: HttpError): APIGatewayProxyStructuredResultV2 {
  const body: ApiError = { error: { code: error.code, message: error.message } };
  return jsonResponse(apiErrorStatus[error.code], body);
}

export function createDictateHandler(deps: DictateDeps) {
  return async (
    event: DictateEvent,
    context: Pick<Context, "awsRequestId">,
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    const requestId = context.awsRequestId;
    const userId = event.requestContext.authorizer.lambda.userId;
    const log = deps.log.child({ requestId, userId });
    try {
      const body = Buffer.from(event.body ?? "", event.isBase64Encoded ? "base64" : "utf8");
      const upload = await readDictationUpload(event.headers["content-type"], body);
      const result = await dictate({ userId, requestId, upload }, { ...deps, log });
      return jsonResponse(200, result);
    } catch (error) {
      if (error instanceof HttpError) {
        log.info("request rejected", { code: error.code });
        return errorResponse(error);
      }
      log.error("request failed", { error: error instanceof Error ? error.name : "unknown" });
      return errorResponse(new HttpError("internal", "Something went wrong; try again."));
    }
  };
}

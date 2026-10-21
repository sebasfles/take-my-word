import type { APIGatewayRequestAuthorizerEventV2 } from "aws-lambda";
import type { AuthContext } from "../lib/auth-context.ts";
import type { Logger } from "../lib/log.ts";

export interface AccessTokenVerifier {
  verify(token: string): Promise<{ sub: string }>;
}

export type AuthorizerResult =
  { isAuthorized: true; context: AuthContext } | { isAuthorized: false };

const bearer = /^Bearer\s+(\S+)$/i;

export function createAuthorizer(verifier: AccessTokenVerifier, log: Logger) {
  return async (
    event: Pick<APIGatewayRequestAuthorizerEventV2, "headers">,
  ): Promise<AuthorizerResult> => {
    const token = bearer.exec(event.headers?.authorization ?? "")?.[1];
    if (token === undefined) {
      log.info("denied", { reason: "no bearer token" });
      return { isAuthorized: false };
    }
    try {
      const { sub } = await verifier.verify(token);
      return { isAuthorized: true, context: { userId: sub } };
    } catch (error) {
      log.info("denied", { reason: error instanceof Error ? error.constructor.name : "unknown" });
      return { isAuthorized: false };
    }
  };
}

import { CognitoJwtVerifier } from "aws-jwt-verify";
import { z } from "zod";
import { createLogger } from "../lib/log.ts";
import { createAuthorizer } from "./authorize.ts";

const env = z
  .object({ USER_POOL_ID: z.string().min(1), USER_POOL_CLIENT_ID: z.string().min(1) })
  .parse(process.env);

const verifier = CognitoJwtVerifier.create({
  userPoolId: env.USER_POOL_ID,
  clientId: env.USER_POOL_CLIENT_ID,
  tokenUse: "access",
});

export const handler = createAuthorizer(
  { verify: (token) => verifier.verify(token) },
  createLogger({ function: "authorizer" }),
);

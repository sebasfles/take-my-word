import { join } from "node:path";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { passwordVerifier, srpStart } from "./srp.ts";

export function loadWorkspaceEnv(): void {
  process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

export async function signIn(input: {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
}): Promise<string> {
  const cognito = new CognitoIdentityProviderClient({
    region: input.userPoolId.split("_")[0] ?? "",
  });
  const { a, A } = srpStart();

  const started = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_SRP_AUTH",
      ClientId: input.clientId,
      AuthParameters: { USERNAME: input.username, SRP_A: A },
    }),
  );
  if (started.ChallengeName !== "PASSWORD_VERIFIER") {
    throw new Error(`unexpected challenge ${started.ChallengeName ?? "none"}`);
  }
  const challenge = started.ChallengeParameters ?? {};
  const userIdForSrp = challenge.USER_ID_FOR_SRP ?? "";
  const secretBlock = challenge.SECRET_BLOCK ?? "";
  const { signature, timestamp } = passwordVerifier({
    userPoolId: input.userPoolId,
    userIdForSrp,
    password: input.password,
    a,
    A,
    srpB: challenge.SRP_B ?? "",
    salt: challenge.SALT ?? "",
    secretBlock,
    now: new Date(),
  });

  const answered = await cognito.send(
    new RespondToAuthChallengeCommand({
      ChallengeName: "PASSWORD_VERIFIER",
      ClientId: input.clientId,
      ChallengeResponses: {
        USERNAME: userIdForSrp,
        PASSWORD_CLAIM_SECRET_BLOCK: secretBlock,
        PASSWORD_CLAIM_SIGNATURE: signature,
        TIMESTAMP: timestamp,
      },
    }),
  );
  const token = answered.AuthenticationResult?.AccessToken;
  if (!token) throw new Error(`sign-in did not finish: ${answered.ChallengeName ?? "no tokens"}`);
  return token;
}

export function signInCrewE2e(): Promise<string> {
  loadWorkspaceEnv();
  return signIn({
    userPoolId: requiredEnv("USER_POOL_ID"),
    clientId: requiredEnv("USER_POOL_CLIENT_ID"),
    username: requiredEnv("CREW_E2E_USERNAME"),
    password: requiredEnv("CREW_E2E_PASSWORD"),
  });
}

import { join } from "node:path";
import {
  CognitoIdentityProviderClient,
  ConfirmDeviceCommand,
  ForgetDeviceCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { deviceVerifier, passwordVerifier, srpStart } from "./srp.ts";

export function loadWorkspaceEnv(): void {
  process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceKey: string | undefined;
  deviceGroupKey: string | undefined;
}

function cognitoFor(userPoolId: string): CognitoIdentityProviderClient {
  return new CognitoIdentityProviderClient({ region: userPoolId.split("_")[0] ?? "" });
}

export async function signIn(input: {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
}): Promise<Session> {
  const cognito = cognitoFor(input.userPoolId);
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
  const result = answered.AuthenticationResult;
  if (!result?.AccessToken || !result.RefreshToken) {
    throw new Error(`sign-in did not finish: ${answered.ChallengeName ?? "no tokens"}`);
  }
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    deviceKey: result.NewDeviceMetadata?.DeviceKey,
    deviceGroupKey: result.NewDeviceMetadata?.DeviceGroupKey,
  };
}

export async function confirmDevice(input: {
  userPoolId: string;
  session: Session;
  deviceName: string;
}): Promise<string> {
  const { deviceKey, deviceGroupKey, accessToken } = input.session;
  if (deviceKey === undefined || deviceGroupKey === undefined) {
    throw new Error("sign-in issued no device");
  }
  const verifier = deviceVerifier({ deviceGroupKey, deviceKey });
  await cognitoFor(input.userPoolId).send(
    new ConfirmDeviceCommand({
      AccessToken: accessToken,
      DeviceKey: deviceKey,
      DeviceName: input.deviceName,
      DeviceSecretVerifierConfig: {
        PasswordVerifier: verifier.passwordVerifier,
        Salt: verifier.salt,
      },
    }),
  );
  return deviceKey;
}

export async function forgetDevice(input: {
  userPoolId: string;
  accessToken: string;
  deviceKey: string;
}): Promise<void> {
  await cognitoFor(input.userPoolId).send(
    new ForgetDeviceCommand({ AccessToken: input.accessToken, DeviceKey: input.deviceKey }),
  );
}

export async function refresh(input: {
  userPoolId: string;
  clientId: string;
  refreshToken: string;
  deviceKey?: string;
}): Promise<Session> {
  const answered = await cognitoFor(input.userPoolId).send(
    new GetTokensFromRefreshTokenCommand({
      ClientId: input.clientId,
      RefreshToken: input.refreshToken,
      ...(input.deviceKey === undefined ? {} : { DeviceKey: input.deviceKey }),
    }),
  );
  const result = answered.AuthenticationResult;
  if (!result?.AccessToken || !result.RefreshToken) throw new Error("refresh returned no tokens");
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    deviceKey: result.NewDeviceMetadata?.DeviceKey ?? input.deviceKey,
    deviceGroupKey: result.NewDeviceMetadata?.DeviceGroupKey,
  };
}

export function crewE2eConfig() {
  loadWorkspaceEnv();
  return {
    userPoolId: requiredEnv("USER_POOL_ID"),
    clientId: requiredEnv("USER_POOL_CLIENT_ID"),
    username: requiredEnv("CREW_E2E_USERNAME"),
    password: requiredEnv("CREW_E2E_PASSWORD"),
  };
}

export function signInCrewE2eSession(): Promise<Session> {
  return signIn(crewE2eConfig());
}

export async function signInCrewE2e(): Promise<string> {
  return (await signIn(crewE2eConfig())).accessToken;
}

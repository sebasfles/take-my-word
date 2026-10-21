import {
  CognitoIdentityProviderClient,
  ConfirmDeviceCommand,
  ForgetDeviceCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  type AuthenticationResultType,
} from "@aws-sdk/client-cognito-identity-provider";
import { deviceVerifier, passwordVerifier, srpStart } from "./srp.ts";

export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceKey: string | undefined;
  deviceGroupKey: string | undefined;
}

export type SignInResult =
  | { kind: "signed-in"; session: Session }
  | { kind: "new-password-required"; username: string; challengeSession: string };

const clients = new Map<string, CognitoIdentityProviderClient>();

function cognitoFor(userPoolId: string): CognitoIdentityProviderClient {
  const region = userPoolId.split("_")[0] ?? "";
  let client = clients.get(region);
  if (client === undefined) {
    client = new CognitoIdentityProviderClient({ region });
    clients.set(region, client);
  }
  return client;
}

function sessionFrom(
  result: AuthenticationResultType | undefined,
  previousDeviceKey?: string,
): Session {
  if (!result?.AccessToken || !result.RefreshToken) throw new Error("Cognito returned no tokens");
  return {
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    deviceKey: result.NewDeviceMetadata?.DeviceKey ?? previousDeviceKey,
    deviceGroupKey: result.NewDeviceMetadata?.DeviceGroupKey,
  };
}

export async function signIn(input: {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
  now?: Date;
}): Promise<SignInResult> {
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
    now: input.now ?? new Date(),
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
  if (answered.ChallengeName === "NEW_PASSWORD_REQUIRED" && answered.Session) {
    return {
      kind: "new-password-required",
      username: userIdForSrp,
      challengeSession: answered.Session,
    };
  }
  if (answered.ChallengeName !== undefined) {
    throw new Error(`unexpected challenge ${answered.ChallengeName}`);
  }
  return { kind: "signed-in", session: sessionFrom(answered.AuthenticationResult) };
}

export async function completeNewPassword(input: {
  userPoolId: string;
  clientId: string;
  username: string;
  challengeSession: string;
  newPassword: string;
}): Promise<Session> {
  const answered = await cognitoFor(input.userPoolId).send(
    new RespondToAuthChallengeCommand({
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: input.clientId,
      Session: input.challengeSession,
      ChallengeResponses: { USERNAME: input.username, NEW_PASSWORD: input.newPassword },
    }),
  );
  if (answered.ChallengeName !== undefined) {
    throw new Error(`unexpected challenge ${answered.ChallengeName}`);
  }
  return sessionFrom(answered.AuthenticationResult);
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
  return sessionFrom(answered.AuthenticationResult, input.deviceKey);
}

export async function revokeToken(input: {
  userPoolId: string;
  clientId: string;
  refreshToken: string;
}): Promise<void> {
  await cognitoFor(input.userPoolId).send(
    new RevokeTokenCommand({ ClientId: input.clientId, Token: input.refreshToken }),
  );
}

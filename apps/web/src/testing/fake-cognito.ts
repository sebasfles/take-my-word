import type { Session, SignInResult } from "@take-my-word/cognito";
import type { AuthDeps, CognitoPort } from "../lib/auth.ts";
import type { Challenge } from "../lib/session.ts";
import { fakeAccessToken, testKey } from "./tokens.ts";

export function cognitoError(name: string): Error {
  const error = new Error(`${name} from Cognito`);
  error.name = name;
  return error;
}

export class FakeCognito implements CognitoPort {
  calls: string[] = [];
  nowSeconds = Date.UTC(2026, 9, 21, 12) / 1000;
  issued = 0;
  signInResult: SignInResult | Error | undefined;
  newPasswordError: Error | undefined;
  refreshError: Error | undefined;
  forgetError: Error | undefined;
  revokeError: Error | undefined;

  tokens(): Session {
    this.issued += 1;
    return {
      accessToken: fakeAccessToken({ username: "crew-e2e", exp: this.nowSeconds + 3600 }),
      refreshToken: `refresh-${this.issued}`,
      deviceKey: "us-east-1_device",
      deviceGroupKey: "group",
    };
  }

  signIn(username: string): Promise<SignInResult> {
    this.calls.push(`signIn:${username}`);
    const result = this.signInResult ?? { kind: "signed-in", session: this.tokens() };
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
  }

  completeNewPassword(challenge: Challenge): Promise<Session> {
    this.calls.push(`completeNewPassword:${challenge.username}`);
    return this.newPasswordError === undefined
      ? Promise.resolve(this.tokens())
      : Promise.reject(this.newPasswordError);
  }

  confirmDevice(session: Session): Promise<string> {
    this.calls.push(`confirmDevice:${session.deviceKey ?? ""}`);
    return Promise.resolve(session.deviceKey ?? "");
  }

  refresh(refreshToken: string, deviceKey: string): Promise<Session> {
    this.calls.push(`refresh:${refreshToken}:${deviceKey}`);
    return this.refreshError === undefined
      ? Promise.resolve({ ...this.tokens(), deviceKey: undefined, deviceGroupKey: undefined })
      : Promise.reject(this.refreshError);
  }

  forgetDevice(accessToken: string, deviceKey: string): Promise<void> {
    this.calls.push(`forgetDevice:${deviceKey}`);
    return this.forgetError === undefined ? Promise.resolve() : Promise.reject(this.forgetError);
  }

  revokeToken(refreshToken: string): Promise<void> {
    this.calls.push(`revokeToken:${refreshToken}`);
    return this.revokeError === undefined ? Promise.resolve() : Promise.reject(this.revokeError);
  }
}

export function fakeDeps(cognito = new FakeCognito()) {
  const logged: { message: string; error: unknown }[] = [];
  const deps: AuthDeps & { clock: { now: number } } = {
    cognito,
    key: testKey(),
    clock: { now: cognito.nowSeconds * 1000 },
    now: () => deps.clock.now,
    log: (message, error) => logged.push({ message, error }),
  };
  return { deps, cognito, logged };
}

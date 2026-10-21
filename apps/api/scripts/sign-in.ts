import { join } from "node:path";
import { signIn, type Session } from "@take-my-word/cognito";

export function loadWorkspaceEnv(): void {
  process.loadEnvFile(join(import.meta.dirname, "..", "..", "..", ".env"));
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name} in .env`);
  return value;
}

async function signInSession(config: {
  userPoolId: string;
  clientId: string;
  username: string;
  password: string;
}): Promise<Session> {
  const result = await signIn(config);
  if (result.kind !== "signed-in") throw new Error(`${config.username} must choose a password`);
  return result.session;
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
  return signInSession(crewE2eConfig());
}

export async function signInCrewE2e(): Promise<string> {
  return (await signInCrewE2eSession()).accessToken;
}

export function crewE2eBConfig() {
  loadWorkspaceEnv();
  return {
    userPoolId: requiredEnv("USER_POOL_ID"),
    clientId: requiredEnv("USER_POOL_CLIENT_ID"),
    username: requiredEnv("CREW_E2E_B_USERNAME"),
    password: requiredEnv("CREW_E2E_B_PASSWORD"),
  };
}

export async function signInCrewE2eB(): Promise<string> {
  return (await signInSession(crewE2eBConfig())).accessToken;
}

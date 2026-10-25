import {
  environments,
  loadConfig,
  providerPair,
  repositoryRoot,
  siteHosts,
} from "@take-my-word/deployment";
import { refinerOf, transcriberOf, transcribers } from "../src/dictation/providers/registry.ts";

export interface ConfiguredPair {
  transcriber: string;
  refiner: string;
  prompted: boolean;
}

export function configuredPair(apiUrl: string): ConfiguredPair {
  const config = loadConfig(repositoryRoot);
  const host = new URL(apiUrl).host;
  const env = environments.find((name) => siteHosts(config.domain, name).api === host);
  if (env === undefined) throw new Error(`${host} is the API of no environment of deployment.json`);
  const pair = providerPair(config, env);
  const keys = () => Promise.resolve({});
  return {
    transcriber: transcriberOf(pair.transcriber, keys).label,
    refiner: refinerOf(pair.refiner, keys).label,
    prompted: transcribers[pair.transcriber].prompted,
  };
}

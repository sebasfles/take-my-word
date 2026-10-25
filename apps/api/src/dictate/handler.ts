import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { s3DebugAudioSink } from "../dictation/audio-sink.ts";
import { dynamoDictationStore, dynamoProfileStore, dynamoQuotaStore } from "../dictation/dynamo.ts";
import { createSilenceGuard } from "../dictation/silence.ts";
import { createLogger, stdout } from "../lib/log.ts";
import { createMetrics } from "../lib/metrics.ts";
import { cachedProviderKeys } from "../lib/secrets.ts";
import { createDictateHandler } from "./app.ts";
import { readConfig } from "./config.ts";
import { selectProviders } from "./providers.ts";

const config = readConfig(process.env);
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const log = createLogger({ function: "dictate" });
const providers = await selectProviders(
  config,
  cachedProviderKeys(new SecretsManagerClient({}), config.PROVIDERS_SECRET_ID),
  log,
);

export const handler = createDictateHandler({
  providers,
  quota: dynamoQuotaStore(dynamo, config.TABLE_NAME),
  dailyQuotaMinutes: config.DAILY_QUOTA_MINUTES,
  dictations: dynamoDictationStore(dynamo, config.TABLE_NAME),
  profile: dynamoProfileStore({ client: dynamo, name: config.TABLE_NAME }),
  dictionary: {
    halfLifeDays: config.DICTIONARY_HALF_LIFE_DAYS,
    promptTokenBudget: config.STT_PROMPT_TOKEN_BUDGET,
  },
  isSilence: createSilenceGuard(),
  silenceLevels: {
    floorDbfs: config.SILENCE_FLOOR_DBFS,
    speechLevelDbfs: config.SPEECH_LEVEL_DBFS,
  },
  ...(config.DEBUG_BUCKET && {
    audioSink: s3DebugAudioSink(new S3Client({}), config.DEBUG_BUCKET),
  }),
  metrics: createMetrics(stdout),
  log,
  now: () => new Date(),
  elapsed: () => performance.now(),
});

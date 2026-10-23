import { discoverySchema, regionOfUserPool, type Discovery } from "@take-my-word/shared";
import type { WebConfig } from "./server/config.ts";

export function discoveryOf(
  config: Pick<WebConfig, "apiUrl" | "userPoolId" | "clientId">,
): Discovery {
  return discoverySchema.parse({
    version: 1,
    apiUrl: config.apiUrl,
    region: regionOfUserPool(config.userPoolId),
    userPoolId: config.userPoolId,
    clientId: config.clientId,
  });
}

export function discoveryHandler(config: () => Parameters<typeof discoveryOf>[0]) {
  return function GET(): Response {
    return Response.json(discoveryOf(config()), {
      headers: { "cache-control": "public, max-age=300" },
    });
  };
}

import { z } from "zod";

export const discoveryPath = "/.well-known/take-my-word.json";

export const hostnamePattern = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const awsRegionPattern = /^[a-z]{2}(-[a-z]+)+-\d{1,2}$/;
const userPoolIdPattern = /^([a-z]{2}(-[a-z]+)+-\d{1,2})_[A-Za-z0-9]{1,55}$/;

export const hostnameSchema = z.string().regex(hostnamePattern);
export const awsRegionSchema = z.string().regex(awsRegionPattern);

export function regionOfUserPool(userPoolId: string): string | null {
  return userPoolIdPattern.exec(userPoolId)?.[1] ?? null;
}

export const discoverySchema = z
  .object({
    version: z.literal(1),
    apiUrl: z
      .string()
      .refine(
        (url) => url.startsWith("https://") && hostnamePattern.test(url.slice("https://".length)),
        "apiUrl is https://<hostname>, with no port, path or query",
      ),
    region: awsRegionSchema,
    userPoolId: z.string().regex(userPoolIdPattern),
    clientId: z.string().regex(/^[a-z0-9]{1,128}$/),
  })
  .refine((discovery) => regionOfUserPool(discovery.userPoolId) === discovery.region, {
    message: "the user pool lives in another region",
    path: ["userPoolId"],
  });
export type Discovery = z.infer<typeof discoverySchema>;

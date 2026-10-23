import { discoveryHandler } from "@/lib/discovery.ts";
import { webConfig } from "@/lib/server/config.ts";

export const dynamic = "force-dynamic";

export const GET = discoveryHandler(webConfig);

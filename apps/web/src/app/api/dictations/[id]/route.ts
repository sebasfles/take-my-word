import { deleteDictationHandler } from "@/lib/handlers.ts";
import { liveDictationDeps } from "@/lib/server/deps.ts";

export const DELETE = deleteDictationHandler(liveDictationDeps);

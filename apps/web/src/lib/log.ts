export function logError(message: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "unknown";
  console.error(JSON.stringify({ level: "error", message, error: name }));
}

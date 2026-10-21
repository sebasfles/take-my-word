import { ProviderError } from "../ports/provider-error.ts";

export type Fetch = typeof fetch;

export interface HttpOptions {
  fetch?: Fetch;
  timeoutMs?: number;
}

export async function postForJson(
  provider: string,
  url: string,
  init: { headers: Record<string, string>; body: NonNullable<RequestInit["body"]> },
  { fetch: fetchImpl = fetch, timeoutMs }: HttpOptions & { timeoutMs: number },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "unknown";
    throw new ProviderError(provider, `${provider} request failed: ${reason}`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(provider, `${provider} answered ${response.status}`, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new ProviderError(provider, `${provider} answered a body that is not JSON`);
  }
}

import { renewSession } from "./renew.ts";
import { signedFetch } from "./signed-fetch.ts";

export type DeleteOutcome = "deleted" | "signed-out" | "failed";

export interface DeleteDeps {
  request: (id: string) => Promise<number>;
  renew: () => Promise<number>;
}

async function requestDelete(id: string): Promise<number> {
  try {
    const response = await signedFetch(`/api/dictations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return response.status;
  } catch {
    return 0;
  }
}

const browserDeps: DeleteDeps = { request: requestDelete, renew: renewSession };

export async function deleteDictation(
  id: string,
  deps: DeleteDeps = browserDeps,
): Promise<DeleteOutcome> {
  let status = await deps.request(id);
  if (status === 401) {
    const renewed = await deps.renew();
    if (renewed === 401) return "signed-out";
    if (renewed !== 200) return "failed";
    status = await deps.request(id);
  }
  return status === 204 || status === 404 ? "deleted" : "failed";
}

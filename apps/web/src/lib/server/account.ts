import { accountApi, type AccountApi } from "../api.ts";
import { whenFresh, type AppData } from "../gate.ts";
import { webConfig } from "./config.ts";
import { requireAppSession } from "./request.ts";

export async function loadAccount<T>(load: (api: AccountApi) => Promise<T>): Promise<AppData<T>> {
  return whenFresh(await requireAppSession(), (accessToken) =>
    load(accountApi(webConfig().apiUrl, accessToken)),
  );
}

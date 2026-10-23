import { expect, test, type Page } from "@playwright/test";
import type { HistoryItem } from "@take-my-word/shared";
import {
  accessToken,
  apiClient,
  createUser,
  env,
  removeUser,
  synthesize,
  type ThrowawayUser,
} from "./accounts.ts";

const sections = ["/app", "/app/dictionary", "/app/styles", "/app/rules", "/app/history"];
const jwt = /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]+/;
const styleName = "Correo a clientes e2e";

const users: ThrowawayUser[] = [];
let seeded: ThrowawayUser;
let fresh: ThrowawayUser;
let seededHistory: HistoryItem[];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  seeded = await createUser(users);
  fresh = await createUser(users);

  const api = apiClient(await accessToken(seeded));
  await api.addTerm("Quelvarix", ["kelvarix", "quelbarix"]);
  await api.addTerm("Take My Word", ["teic mai word"]);
  await api.addTerm("Ñandú Labs", []);
  const style = await api.addStyle(styleName, "Trato de usted, cálido y profesional.");
  await api.setDefaultStyle(style.id);
  await api.addRule("slack.exe", style.id);
  const speech = await Promise.all([
    synthesize("Hola equipo, mañana revisamos el contrato con Quelvarix."),
    synthesize("Recuérdame llamar a Raúl antes de la reunión del viernes."),
  ]);
  for (const audio of speech) await api.dictate(audio);
  seededHistory = await api.history();
  expect(seededHistory).toHaveLength(2);
});

test.afterAll(async () => {
  test.setTimeout(60_000);
  const failures = (await Promise.allSettled(users.map(removeUser))).flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) throw new AggregateError(failures, "throwaway users left behind");
});

async function signInAs(page: Page, user: ThrowawayUser): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

function watchBrowserTraffic(page: Page, baseURL: string | undefined) {
  const webHost = new URL(baseURL ?? "").host;
  const apiHost = new URL(env("API_URL")).host;
  const hosts = new Set<string>();
  const leaks: string[] = [];
  const reads: Promise<void>[] = [];
  page.on("request", (request) => {
    hosts.add(new URL(request.url()).host);
  });
  page.on("requestfinished", (request) => {
    if (new URL(request.url()).host !== webHost) return;
    reads.push(
      request
        .response()
        .then(async (response) => {
          if (response !== null && jwt.test(await response.text())) leaks.push(request.url());
        })
        .catch(() => undefined),
    );
  });
  return async () => {
    await Promise.all(reads);
    expect(hosts).not.toContain(apiHost);
    expect([...hosts].filter((host) => host !== webHost)).toEqual([]);
    expect(leaks).toEqual([]);
  };
}

test("sends a visitor without a session from every account page to sign-in", async ({ page }) => {
  for (const path of sections) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
});

test("shows the seeded account on every page, without a token reaching the browser", async ({
  page,
  baseURL,
}) => {
  const verifyTraffic = watchBrowserTraffic(page, baseURL);
  await signInAs(page, seeded);

  await expect(page.getByTestId("account-username")).toHaveText(seeded.username);
  await expect(page.getByTestId("default-style")).toHaveText(styleName);
  await expect(page.getByTestId("account-language")).toHaveText("Spanish");
  await expect(page.getByTestId("account-dictation-languages")).toHaveText("Spanish");
  await expect(page.getByTestId("account-context").locator(".tmw-badge")).toHaveText([
    "Law",
    "Student",
  ]);
  await expect(page.getByTestId("account-context-detail")).toHaveText("contratos");
  await expect(page.getByTestId("account-usage")).toContainText(/[1-9]\d* of \d+ minutes/);
  await expect(page.getByTestId("account-usage")).toContainText("Resets at");

  await page.getByRole("link", { name: "Dictionary" }).click();
  await expect(page.getByTestId("term")).toHaveCount(3);
  await expect(page.getByTestId("terms")).toContainText("kelvarix");
  await page.getByRole("link", { name: "Name" }).click();
  await expect(page.getByTestId("term").first()).toContainText("Ñandú Labs");

  await page.getByRole("link", { name: "Styles" }).click();
  await expect(page.getByTestId("builtin-style")).toHaveText([/Plain/, /Casual/, /Formal/]);
  await expect(page.getByTestId("custom-style")).toHaveCount(1);
  await expect(page.getByTestId("custom-style")).toContainText(styleName);
  await expect(page.getByTestId("custom-style")).toContainText("Default");

  await page.getByRole("link", { name: "App rules" }).click();
  await expect(page.getByTestId("rule")).toHaveCount(1);
  await expect(page.getByTestId("rule")).toContainText("slack.exe");
  await expect(page.getByTestId("rule")).toContainText(styleName);

  await page.getByRole("link", { name: "History" }).click();
  const dictations = page.getByTestId("dictation");
  await expect(dictations).toHaveCount(2);
  const [newest] = seededHistory;
  if (newest === undefined) throw new Error("no dictations seeded");
  await expect(dictations.first()).toContainText(newest.text);
  const raw = dictations.first().locator(".dictation-raw p");
  await expect(raw).toBeHidden();
  await dictations.first().getByText("Original transcript").click();
  await expect(raw).toBeVisible();
  await expect(raw).toHaveText(newest.raw);

  await page.getByRole("button", { name: "ES, ver en español" }).click();
  await expect(page.getByRole("heading", { name: "Historial" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reglas por app" })).toBeVisible();
  await page.getByRole("link", { name: "Cuenta" }).click();
  await expect(page.getByTestId("account-language")).toHaveText("Español");
  await expect(page.getByTestId("account-dictation-languages")).toHaveText("Español");
  await expect(page.getByTestId("account-context").locator(".tmw-badge")).toHaveText([
    "Derecho",
    "Estudiante",
  ]);
  await page.getByRole("button", { name: "EN, view in English" }).click();
  await expect(page.getByRole("heading", { name: `Hi, ${seeded.username}` })).toBeVisible();

  await verifyTraffic();
});

test("loads the next page of history and deletes a dictation after confirming", async ({
  page,
}) => {
  await signInAs(page, seeded);
  await page.goto("/app/history?limit=1");
  const dictations = page.getByTestId("dictation");
  await expect(dictations).toHaveCount(1);

  await page.getByRole("link", { name: "Load more" }).click();
  await expect(page).toHaveURL(/\/app\/history\?pages=2&limit=1$/);
  await expect(dictations).toHaveCount(2);
  await expect(page.getByRole("link", { name: "Load more" })).toBeHidden();

  const [kept, deleted] = seededHistory;
  if (kept === undefined || deleted === undefined) throw new Error("two dictations expected");
  const target = dictations.nth(1);
  await target.getByRole("button", { name: "Delete" }).click();
  await expect(target.getByText("Delete this dictation? This cannot be undone.")).toBeVisible();
  await target.getByRole("button", { name: "Cancel" }).click();
  await expect(dictations).toHaveCount(2);

  await target.getByRole("button", { name: "Delete" }).click();
  await target.getByRole("button", { name: "Yes, delete" }).click();
  await expect(dictations).toHaveCount(1);
  await expect(dictations.first()).toContainText(kept.text);

  await page.reload();
  await expect(dictations).toHaveCount(1);
  const remaining = await apiClient(await accessToken(seeded)).history();
  expect(remaining.map((item) => item.id)).toEqual([kept.id]);
});

test("shows the empty state of every page to a user without data", async ({ page }) => {
  await signInAs(page, fresh);
  await expect(page.getByTestId("default-style")).toHaveText("Plain");
  for (const path of ["/app/dictionary", "/app/rules", "/app/history"]) {
    await page.goto(path);
    await expect(page.getByTestId("empty-state")).toBeVisible();
  }
  await page.goto("/app/styles");
  await expect(page.getByTestId("builtin-style")).toHaveCount(3);
  await expect(
    page
      .getByTestId("empty-state")
      .getByText("No styles of your own yet. Create them from the desktop app.", { exact: true }),
  ).toBeVisible();
});

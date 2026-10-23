const params = new URLSearchParams(window.location.search);

const problem = (message: string) =>
  Promise.reject(Object.assign(new Error(message), { backToSignIn: false }));

const updatePhases: Record<string, object> = {
  available: { phase: "available" },
  downloading: { phase: "downloading", percent: 40 },
  installing: { phase: "installing" },
  failed: { phase: "failed" },
};

const updateNotes = {
  es: "Pega más rápido en terminales y recupera el portapapeles aunque otra app lo tenga ocupado.\nCorrige el atajo con teclados en español.",
  en: "Pastes faster in terminals and restores the clipboard even when another app holds it.\nFixes the shortcut on Spanish keyboards.",
};

const empty = params.get("data") === "empty";
const day = (offset: number) => new Date(Date.UTC(2026, 9, 21 - offset, 15, 42)).toISOString();

const styles = [
  { id: "plain", name: "Plain", prompt: "", builtin: true },
  { id: "casual", name: "Casual", prompt: "Write casually.", builtin: true },
  { id: "formal", name: "Formal", prompt: "Write formally.", builtin: true },
  ...(empty
    ? []
    : [
        {
          id: "c7d1",
          name: "Correos a clientes",
          prompt:
            "Trato de usted, frases cortas y un cierre cordial. Sin emojis ni signos de exclamación dobles.",
          builtin: false,
        },
        {
          id: "a91f",
          name: "Slack del equipo",
          prompt: "Directo y breve, sin saludo.",
          builtin: false,
        },
      ]),
];

const terms = empty
  ? []
  : [
      {
        id: "a3ViZXJuZXRlcw",
        term: "Kubernetes",
        aliases: ["cubernetes", "kubernetis"],
        useCount: 14,
        lastUsedAt: day(0),
        createdAt: day(30),
      },
      {
        id: "dGFrZSBteSB3b3Jk",
        term: "Take My Word",
        aliases: ["teik mai word"],
        useCount: 6,
        lastUsedAt: day(2),
        createdAt: day(20),
      },
      {
        id: "dmFscGFyYcOtc28",
        term: "Valparaíso",
        aliases: [],
        useCount: 1,
        lastUsedAt: day(9),
        createdAt: day(9),
      },
    ];

const rules = empty
  ? []
  : [
      { id: "bm90ZXBhZC5leGU", appId: "notepad.exe", styleId: "c7d1", keystroke: "shift+insert" },
      { id: "b3V0bG9vay5leGU", appId: "outlook.exe", styleId: "formal", keystroke: "ctrl+v" },
      { id: "c2xhY2suZXhl", appId: "slack.exe", styleId: "gone", keystroke: "ctrl+v" },
      { id: "d2luZG93c3Rlcm1pbmFsLmV4ZQ", appId: "windowsterminal.exe", keystroke: "ctrl+shift+v" },
    ];

const dictations = empty
  ? []
  : [
      {
        id: "MjAyNi0xMC0yMVQxNTo0Mg",
        createdAt: day(0),
        locale: "es-CL",
        text: "Hola Carolina, te envío el informe del trimestre. Quedo atento a tus comentarios.",
        raw: "eh hola carolina te envío el informe del del trimestre quedo atento a tus comentarios",
        styleId: "c7d1",
        audioSeconds: 7.4,
      },
      {
        id: "MjAyNi0xMC0yMFQxNTo0Mg",
        createdAt: day(1),
        locale: "en-US",
        text: "Let's move the Kubernetes upgrade to Thursday.",
        raw: "so let's move the cubernetes upgrade to thursday",
        styleId: "a91f",
        audioSeconds: 3.1,
      },
      {
        id: "MjAyNi0xMC0xOVQxNTo0Mg",
        createdAt: day(2),
        locale: "es-CL",
        text: "Compra pan y leche.",
        raw: "compra pan y leche",
        audioSeconds: 1.6,
      },
    ];

const failure = (kind: string, status: number | null, code: string | null) =>
  Promise.reject(Object.assign(new Error(kind), { kind, status, code }));
const rejected = (status: number, code: string) => failure("rejected", status, code);

function route(request: Record<string, unknown>): Promise<unknown> {
  const name = String(request.route);
  if (params.get("fail") === name) return failure("network", null, null);
  if (params.get("pending") === name) return new Promise(() => undefined);
  switch (name) {
    case "listTerms":
      return Promise.resolve({ terms });
    case "addTerm":
      return rejected(409, "conflict");
    case "listStyles":
      return Promise.resolve({ styles });
    case "getSettings":
      return Promise.resolve({
        defaultStyleId: "plain",
        locale: "es",
        dictationLanguages: ["es"],
        providers: { transcriber: "groq-whisper", refiner: "openai" },
        context:
          params.get("context") === "empty"
            ? { picks: [], detail: "" }
            : {
                picks: ["software-development", "data-ai"],
                detail: "backend con AWS y TypeScript",
              },
      });
    case "getUsage":
      if (params.get("usage") === "none") return rejected(404, "not_found");
      return Promise.resolve({
        usedSeconds: params.get("usage") === "over" ? 3655 : 754,
        capSeconds: 3600,
        resetsAt: "2026-10-24T00:00:00.000Z",
      });
    case "replaceSettings":
      return Promise.resolve(request.body);
    case "listAppRules":
      return Promise.resolve({ rules });
    case "createAppRule":
      return rejected(409, "conflict");
    case "listDictations":
      return Promise.resolve(
        request.cursor === undefined && !empty
          ? { items: dictations, cursor: "bmV4dA" }
          : { items: [] },
      );
    default:
      return Promise.resolve(null);
  }
}

const appStates: Record<string, object> = {
  fresh: { signedIn: false, username: null, firstRunDone: false, onboarded: false },
  "signed-out": { signedIn: false, username: null, firstRunDone: true, onboarded: true },
  "new-user": { signedIn: true, username: "sebastian", firstRunDone: true, onboarded: false },
};

export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const answer = (value: unknown) => Promise.resolve(value as T);
  switch (command) {
    case "app_state":
      return answer({
        signedIn: true,
        username: "sebastian",
        firstRunDone: true,
        onboarded: true,
        handsFreeNote: params.get("note") === "1",
        ...appStates[params.get("state") ?? ""],
      });
    case "check_microphone":
      return answer(params.get("mic") ?? "ready");
    case "overview":
      return answer({
        hotkey: params.get("build") === "dev" ? ["Ctrl", "Alt", "Win"] : ["Ctrl", "Win"],
        autostart: params.get("autostart") !== "off",
        microphone: params.get("mic") ?? "ready",
        version: "0.3.0",
      });
    case "theme":
      return answer(null);
    case "set_theme":
      return answer(args?.choice ?? null);
    case "propose_hotkey":
      return params.get("propose") === "altgr"
        ? problem("hotkey.rightAlt")
        : answer(["Ctrl", "Shift"]);
    case "account_status":
      return answer(
        params.get("account") === "signed-out"
          ? { signedIn: false, username: null }
          : { signedIn: true, username: "sebastian" },
      );
    case "sign_in":
      if (params.get("signin") === "wrong") {
        return problem("account.wrongCredentials");
      }
      return answer(params.get("signin") === "new-password" ? "choosePassword" : "onboarding");
    case "choose_password":
      return params.get("password") === "weak"
        ? problem("account.invalidPassword")
        : answer("onboarding");
    case "onboarding":
      if (params.get("styles") === "pending") return new Promise(() => undefined);
      return params.get("styles") === "fail"
        ? problem("account.unreachable")
        : answer({
            styles: [
              { id: "plain", name: "Plain", prompt: "", builtin: true },
              { id: "casual", name: "Casual", prompt: "Write casually.", builtin: true },
              { id: "formal", name: "Formal", prompt: "Write formally.", builtin: true },
              {
                id: "c7d1",
                name: "Correos a clientes",
                prompt:
                  "Trato de usted, frases cortas y un cierre cordial. Sin emojis ni signos de exclamación dobles.",
                builtin: false,
              },
            ],
            selected: "plain",
            dictationLanguages: [params.get("lang") === "es" ? "es" : "en"],
            context: { picks: [], detail: "" },
          });
    case "api_request":
      return route(args?.route as Record<string, unknown>) as Promise<T>;
    case "ui_language":
    case "set_ui_language":
      return answer({
        choice: command === "set_ui_language" ? (args?.choice ?? null) : null,
        windows: params.get("lang") === "es" ? "es" : "en",
      });
    case "running_apps":
      return answer(["chrome.exe", "code.exe", "notepad.exe", "slack.exe", "winword.exe"]);
    case "set_autostart":
      return params.get("autostart-fails") === "1"
        ? Promise.reject(new Error("access denied"))
        : answer(args?.enabled);
    case "update_view": {
      const language = params.get("lang") === "en" ? "en" : "es";
      return answer({
        version: "0.1.1",
        notes: updateNotes[language],
        ...updatePhases[params.get("update") ?? "available"],
      });
    }
    default:
      return answer(undefined);
  }
}

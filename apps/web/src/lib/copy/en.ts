export interface DemoSegment {
  text: string;
  kind?: "filler" | "fixed";
}

export interface DemoScript {
  lang: "en" | "es";
  app: string;
  channel: string;
  spoken: DemoSegment[][];
  written: string;
}

const englishDemo: DemoScript = {
  lang: "en",
  app: "Chat",
  channel: "#launch",
  spoken: [
    [{ text: "um, ", kind: "filler" }, { text: "tomorrow at ten " }],
    [{ text: "we " }, { text: "like, ", kind: "filler" }, { text: "review the " }],
    [{ text: "cubernetes", kind: "fixed" }, { text: " rollout with " }],
    [
      { text: "raul", kind: "fixed" },
      { text: ", " },
      { text: "you know, ", kind: "filler" },
      { text: "if he can" },
    ],
  ],
  written: "Tomorrow at ten we review the Kubernetes rollout with Raúl, if he can.",
};

const spanishDemo: DemoScript = {
  lang: "es",
  app: "Chat",
  channel: "#despliegues",
  spoken: [
    [{ text: "eh, ", kind: "filler" }, { text: "mañana a las diez, " }],
    [{ text: "este, ", kind: "filler" }, { text: "revisamos el despliegue de " }],
    [
      { text: "cubernetes", kind: "fixed" },
      { text: " con " },
      { text: "raul", kind: "fixed" },
      { text: ", " },
    ],
    [{ text: "o sea, ", kind: "filler" }, { text: "si puede" }],
  ],
  written: "Mañana a las diez revisamos el despliegue de Kubernetes con Raúl, si puede.",
};

export const demos = { en: englishDemo, es: spanishDemo };

export const en = {
  meta: {
    title: "Take My Word",
    description:
      "Voice dictation for Windows: hold a key, speak, release, and clean text lands in the app you are using.",
    ogAlt: "Take My Word: Say it once. It’s written.",
  },
  skip: "Skip to content",
  locale: { switchTo: "ES", switchLabel: "Ver en español" },
  theme: { label: "Theme", system: "System", light: "Light", dark: "Dark" },
  nav: {
    label: "Main",
    signIn: "Sign in",
    home: "Home",
    howItWorks: "How it works",
    privacy: "Privacy",
    download: "Download",
  },
  landing: {
    tagline: "Your Word, Our Command.",
    kicker: "Voice dictation for Windows",
    headline: ["Say it once.", "It’s written."],
    pitch:
      "Hold Ctrl + Win, speak, release. Take My Word transcribes what you said, drops the filler words and pastes clean text into the app in front of you.",
    download: "Download for Windows",
    version: "Version {version} for Windows 10 and 11",
    versionless: "For Windows 10 and 11",
    soon: "macOS and Linux soon.",
    demo: {
      label:
        "Demo: holding Ctrl and Win, a message is dictated and appears written without filler words.",
      keys: ["Ctrl", "Win"],
      listening: "Listening",
      cleaning: "Cleaning up",
      pasted: "Pasted",
      said: "What you said",
      written: "What gets written",
    },
    stepsTitle: "How it works",
    stepsIntro: "Three moves, in any app where you can type.",
    steps: [
      { title: "Hold", body: "Press and hold Ctrl + Win wherever your cursor is." },
      {
        title: "Speak",
        body: "In English or Spanish, at your own pace, pauses, ums and all.",
      },
      { title: "Release", body: "Clean, punctuated text appears where your cursor was." },
    ],
    multilingual: {
      title: "Bilingual from the first word",
      body: "Dictate in English or Spanish and switch whenever you like. The same cleanup works in both.",
      label: "In Spanish",
    },
    dictionary: {
      kicker: "Personal dictionary",
      title: "Your words, spelled your way.",
      body: "Names, brands and jargon that no transcriber knows. Add them once, with what they sound like, and Take My Word writes them as you do, accents included.",
      heard: "Heard",
      written: "Written",
      examples: [
        { heard: "kubernetis", written: "Kubernetes" },
        { heard: "raul hernandez", written: "Raúl Hernández" },
        { heard: "teic mai word", written: "Take My Word" },
        { heard: "nandu labs", written: "Ñandú Labs" },
      ],
    },
    styles: {
      kicker: "Styles",
      title: "Same words, the right tone.",
      body: "Pick how the clean text should read. Styles change the tone and the register, never what you meant.",
      spoken: "tell ana the report is late i'll send it friday",
      examples: [
        { name: "Plain", text: "Tell Ana the report is late. I'll send it Friday." },
        { name: "Casual", text: "tell Ana the report's running late, I'll send it Friday" },
        {
          name: "Formal",
          text: "Please let Ana know the report is delayed; I will send it on Friday.",
        },
      ],
    },
    rules: {
      kicker: "Per-app rules",
      title: "Each app gets its own voice.",
      body: "Chat stays casual, email stays formal, and the terminal gets the paste shortcut it needs. Set it once per app.",
      app: "App",
      style: "Style",
      paste: "Paste with",
      rows: [
        { app: "Slack", style: "Casual", keys: ["Ctrl", "V"] },
        { app: "Outlook", style: "Formal", keys: ["Ctrl", "V"] },
        { app: "Windows Terminal", style: "Plain", keys: ["Ctrl", "Shift", "V"] },
      ],
    },
    privacy: {
      kicker: "Privacy",
      title: "Your voice is not kept.",
      points: [
        {
          title: "Audio is never stored",
          body: "It is transcribed and discarded. Not on our servers, not in a log.",
        },
        {
          title: "Text for 90 days",
          body: "So you can find what you dictated. After that it is deleted on its own.",
        },
        {
          title: "Yours to delete",
          body: "Remove any dictation from your history whenever you want.",
        },
      ],
    },
    get: {
      title: "Ready when you are.",
      body: "Take My Word is invitation only for now. Install it on Windows and sign in with the account from your invitation.",
    },
    footer: {
      rights: "Take My Word",
      releases: "Releases",
    },
    invite: "For now Take My Word is invitation only.",
    haveAccount: "Already have an account?",
  },
  signIn: {
    title: "Sign in",
    intro: "Use the username and password that came with your invitation.",
    username: "Username",
    password: "Password",
    remember: "Remember me on this browser",
    submit: "Sign in",
    submitting: "Signing in…",
    invalidCredentials: "Wrong username or password.",
    unavailable: "We could not reach the service. Try again in a few minutes.",
    newPasswordTitle: "Choose your password",
    newPasswordIntro: "This is your first sign-in: replace the temporary password with your own.",
    newPassword: "New password",
    confirmPassword: "Repeat the password",
    passwordRules: "At least 12 characters, with uppercase, lowercase and numbers.",
    mismatch: "The passwords do not match.",
    invalidPassword: "The password does not meet the requirements.",
    expired: "The sign-in expired. Sign in again with your temporary password.",
    save: "Save and sign in",
    saving: "Saving…",
    asideQuote: "Say it once. It’s written.",
    asideBody: "Your dictionary, styles and history, in one place.",
  },
  app: {
    title: "Your account",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    readOnly: "This is a read-only view of your account; make changes from the desktop app.",
  },
  sections: {
    label: "Account sections",
    account: "Account",
    dictionary: "Dictionary",
    styles: "Styles",
    rules: "App rules",
    history: "History",
  },
  state: {
    loading: "Loading…",
    errorTitle: "We could not load this section",
    errorBody: "The service did not answer. Try again in a few minutes.",
    retry: "Try again",
  },
  account: {
    greeting: "Hi, {username}",
    username: "Username",
    defaultStyle: "Default style",
    language: "Language",
    transcriber: "Transcription",
    refiner: "Text cleanup",
  },
  dictionary: {
    title: "Dictionary",
    intro: "The terms Take My Word spells the way you do.",
    sortLabel: "Sort by",
    byRelevance: "Relevance",
    byName: "Name",
    aliases: "Also sounds like",
    uses: "Uses",
    lastUsed: "Last used",
    emptyTitle: "No terms yet",
    empty: "No terms yet. Add them from the desktop app.",
  },
  styles: {
    title: "Styles",
    intro: "How the clean text should read: tone and register, never the content.",
    builtinTitle: "Built-in",
    customTitle: "Your styles",
    builtin: "Built-in",
    isDefault: "Default",
    emptyTitle: "No styles of your own",
    empty: "No styles of your own yet. Create them from the desktop app.",
    names: { plain: "Plain", casual: "Casual", formal: "Formal" },
    descriptions: {
      plain: "Clean only: drops fillers and punctuates, without changing the tone.",
      casual: "For chats: friendly and direct.",
      formal: "For email: careful and professional.",
    },
    deleted: "Deleted style",
    fallback: "Default style",
  },
  rules: {
    title: "App rules",
    intro: "The style and paste shortcut the desktop app uses in each application.",
    app: "App",
    style: "Style",
    keystroke: "Paste shortcut",
    emptyTitle: "No app rules yet",
    empty: "No app rules yet. Create them from the desktop app.",
  },
  history: {
    title: "History",
    intro: "Your dictations from the last 90 days, newest first.",
    date: "Date",
    style: "Style",
    audio: "Audio",
    noText: "No text",
    raw: "Original transcript",
    loadMore: "Load more",
    loadingMore: "Loading…",
    delete: "Delete",
    confirm: "Delete this dictation? This cannot be undone.",
    confirmDelete: "Yes, delete",
    cancel: "Cancel",
    deleting: "Deleting…",
    deleteFailed: "We could not delete the dictation. Try again.",
    emptyTitle: "No dictations yet",
    empty: "No dictations yet. They show up here when you dictate from the desktop app.",
  },
  renew: {
    renewing: "Renewing your session…",
    unavailable: "We could not renew your session. Try again in a few minutes.",
    retry: "Try again",
  },
};

export type Dictionary = typeof en;

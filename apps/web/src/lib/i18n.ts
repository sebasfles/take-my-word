export const locales = ["es", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";
export const localeCookieName = "tmw-lang";
export const localeMaxAgeSeconds = 365 * 24 * 60 * 60;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function localeFrom(cookieValue: string | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : defaultLocale;
}

export function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
}

const es = {
  meta: {
    title: "Take My Word",
    description:
      "Dictado por voz para Windows: mantén una tecla, habla, suelta y el texto limpio aparece en la app que estás usando.",
  },
  locale: { switchTo: "EN", switchLabel: "Ver en inglés" },
  nav: { signIn: "Iniciar sesión", home: "Inicio" },
  landing: {
    tagline: "Tu palabra, nuestra orden.",
    pitch:
      "Mantén una tecla, habla y suelta. Take My Word transcribe lo que dijiste, lo deja limpio y lo pega en la app que tienes delante.",
    download: "Descargar para Windows",
    downloadNote: "Para Windows 10 y 11. macOS y Linux llegan después.",
    stepsTitle: "Así funciona",
    steps: [
      { title: "Mantén", body: "Deja presionada tu tecla de dictado, en cualquier app." },
      { title: "Habla", body: "En español o en inglés, a tu ritmo, con pausas y todo." },
      { title: "Suelta", body: "El texto limpio aparece donde estaba el cursor." },
    ],
    featuresTitle: "Qué hace la versión 1",
    features: [
      "Transcribe español e inglés y quita las muletillas.",
      "Puntúa el texto y escribe tus términos como tú los escribes, gracias a tu diccionario.",
      "Usa el estilo que elijas (neutro, formal o casual) y cada app puede tener el suyo.",
      "Pega con el atajo de teclado que necesita cada app.",
      "Guarda el texto 90 días para que lo encuentres; el audio nunca se guarda.",
    ],
    invite: "Por ahora Take My Word es solo por invitación.",
    haveAccount: "¿Ya tienes cuenta?",
  },
  signIn: {
    title: "Inicia sesión",
    intro: "Usa el usuario y la contraseña que recibiste con tu invitación.",
    username: "Usuario",
    password: "Contraseña",
    remember: "Recordarme en este navegador",
    submit: "Entrar",
    submitting: "Entrando…",
    invalidCredentials: "Usuario o contraseña incorrectos.",
    unavailable: "No pudimos conectar con el servicio. Inténtalo de nuevo en unos minutos.",
    newPasswordTitle: "Elige tu contraseña",
    newPasswordIntro: "Es tu primer inicio de sesión: cambia la contraseña temporal por una tuya.",
    newPassword: "Contraseña nueva",
    confirmPassword: "Repite la contraseña",
    passwordRules: "Al menos 12 caracteres, con mayúsculas, minúsculas y números.",
    mismatch: "Las contraseñas no coinciden.",
    invalidPassword: "La contraseña no cumple los requisitos.",
    expired: "El inicio de sesión expiró. Vuelve a entrar con tu contraseña temporal.",
    save: "Guardar y entrar",
    saving: "Guardando…",
  },
  app: {
    title: "Tu cuenta",
    signedInAs: "Sesión iniciada como",
    signOut: "Cerrar sesión",
    greeting: "Hola, {username}",
    defaultStyle: "Tu estilo por defecto",
    settingsUnavailable: "No pudimos cargar tus ajustes en este momento.",
    comingSoonTitle: "Tu cuenta, muy pronto",
    comingSoon:
      "Aquí verás tu diccionario, tus estilos, tus reglas por app y tu historial. Llegan en la próxima versión; mientras tanto, se editan desde la app de escritorio.",
  },
  renew: {
    renewing: "Renovando tu sesión…",
    unavailable: "No pudimos renovar tu sesión. Inténtalo de nuevo en unos minutos.",
    retry: "Reintentar",
  },
};

export type Dictionary = typeof es;

const en: Dictionary = {
  meta: {
    title: "Take My Word",
    description:
      "Voice dictation for Windows: hold a key, speak, release, and clean text lands in the app you are using.",
  },
  locale: { switchTo: "ES", switchLabel: "Ver en español" },
  nav: { signIn: "Sign in", home: "Home" },
  landing: {
    tagline: "Your Word, Our Command.",
    pitch:
      "Hold a key, speak, release. Take My Word transcribes what you said, cleans it up and pastes it into the app in front of you.",
    download: "Download for Windows",
    downloadNote: "For Windows 10 and 11. macOS and Linux come later.",
    stepsTitle: "How it works",
    steps: [
      { title: "Hold", body: "Press and hold your dictation key, in any app." },
      { title: "Speak", body: "In Spanish or English, at your own pace, pauses and all." },
      { title: "Release", body: "Clean text appears where your cursor was." },
    ],
    featuresTitle: "What version 1 does",
    features: [
      "Transcribes Spanish and English and drops the filler words.",
      "Punctuates the text and spells your terms the way you do, thanks to your dictionary.",
      "Writes in the style you pick (plain, formal or casual), and each app can have its own.",
      "Pastes with the keyboard shortcut each app needs.",
      "Keeps the text for 90 days so you can find it; the audio is never stored.",
    ],
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
  },
  app: {
    title: "Your account",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    greeting: "Hi, {username}",
    defaultStyle: "Your default style",
    settingsUnavailable: "We could not load your settings right now.",
    comingSoonTitle: "Your account, coming soon",
    comingSoon:
      "This is where your dictionary, styles, app rules and history will live. They arrive in the next version; until then, edit them from the desktop app.",
  },
  renew: {
    renewing: "Renewing your session…",
    unavailable: "We could not renew your session. Try again in a few minutes.",
    retry: "Try again",
  },
};

const dictionaries: Record<Locale, Dictionary> = { es, en };

export function dictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

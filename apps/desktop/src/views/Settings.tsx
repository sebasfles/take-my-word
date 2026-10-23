import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Icon,
  type IconName,
  navItemClass,
  Toggle,
  Wordmark,
  buttonClass,
} from "@take-my-word/brand";
import {
  type AccountView,
  bridge,
  type Overview,
  keepListening,
  problemOf,
  type Theme,
} from "../bridge.ts";
import { type MessageId, t } from "../i18n.ts";
import { Gestures } from "../Gestures.tsx";
import { Keys } from "../Keys.tsx";
import { focusAddFromSearch, type SettingsSection, settingsSectionFromSearch } from "../view.ts";
import { AppRules } from "./settings/AppRules.tsx";
import { Dictionary } from "./settings/Dictionary.tsx";
import { History } from "./settings/History.tsx";
import { UserContextRow } from "./settings/Context.tsx";
import { DictationLanguagesRow, UiLanguageRow } from "./settings/Languages.tsx";
import { SectionPage } from "./settings/parts.tsx";
import { Styles } from "./settings/Styles.tsx";
import { UsageCard } from "./settings/Usage.tsx";

type Capture = { step: "idle" } | { step: "listening" } | { step: "proposed"; keys: string[] };

const CAPTURE_TIMEOUT_MS = 15_000;

const sections: { id: SettingsSection; label: MessageId; icon: IconName }[] = [
  { id: "general", label: "settings.general", icon: "general" },
  { id: "dictionary", label: "settings.dictionary", icon: "dictionary" },
  { id: "styles", label: "settings.styles", icon: "styles" },
  { id: "appRules", label: "settings.appRules", icon: "rules" },
  { id: "history", label: "settings.history", icon: "history" },
  { id: "account", label: "settings.account", icon: "account" },
];

export function Settings({
  handsFreeNote,
  onDismissNote,
  onRerun,
}: {
  handsFreeNote: boolean;
  onDismissNote: () => void;
  onRerun: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>(() =>
    settingsSectionFromSearch(window.location.search),
  );
  const [focusAdd, setFocusAdd] = useState(() =>
    focusAddFromSearch(window.location.search) ? 1 : 0,
  );

  useEffect(
    () =>
      keepListening(() =>
        bridge.onMainNavigate((query) => {
          setSection(settingsSectionFromSearch(query));
          if (focusAddFromSearch(query)) setFocusAdd((count) => count + 1);
        }),
      ),
    [],
  );

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label={t("settings.sections")}>
        <div className="settings-nav-inner">
          <Wordmark height={22} className="settings-brand" />
          <ul>
            {sections.map(({ id, label, icon }) => (
              <li key={id}>
                <button
                  type="button"
                  className={navItemClass(section === id)}
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => {
                    setSection(id);
                  }}
                >
                  <Icon name={icon} className="line-icon" />
                  {t(label)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      {section === "general" && (
        <General handsFreeNote={handsFreeNote} onDismissNote={onDismissNote} onRerun={onRerun} />
      )}
      {section === "dictionary" && <Dictionary focusAdd={focusAdd} />}
      {section === "styles" && <Styles />}
      {section === "appRules" && <AppRules />}
      {section === "history" && <History />}
      {section === "account" && <Account />}
    </div>
  );
}

function General({
  handsFreeNote,
  onDismissNote,
  onRerun,
}: {
  handsFreeNote: boolean;
  onDismissNote: () => void;
  onRerun: () => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [autostartError, setAutostartError] = useState(false);

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const toggleAutostart = (enabled: boolean) => {
    setAutostartError(false);
    bridge
      .setAutostart(enabled)
      .then((autostart) => {
        setOverview((current) => current && { ...current, autostart });
      })
      .catch(() => {
        setAutostartError(true);
      });
  };

  return (
    <SectionPage title="settings.general" intro="settings.general.intro" wide>
      {handsFreeNote && <HandsFreeNote onDismiss={onDismissNote} />}
      <div className="general">
        <div className="panel general-main">
          <ShortcutRow
            hotkey={overview?.hotkey ?? null}
            onSaved={(hotkey) => {
              setOverview((current) => current && { ...current, hotkey });
            }}
          />

          <section className="setting">
            <div className="setting-text">
              <h2 className="setting-title">{t("settings.autostart")}</h2>
              <p className="setting-note">{t("settings.autostart.note")}</p>
              {autostartError && (
                <p className="tmw-error" role="alert">
                  {t("settings.autostart.failed")}
                </p>
              )}
            </div>
            <Toggle
              label={<span className="visually-hidden">{t("settings.autostart")}</span>}
              checked={overview?.autostart ?? false}
              disabled={!overview}
              onChange={toggleAutostart}
            />
          </section>

          <ThemeRow />

          <UiLanguageRow />

          <DictationLanguagesRow />

          <UserContextRow />
        </div>

        <aside className="general-aside">
          <UsageCard />
          <section className="panel aside-card" aria-labelledby="how-to-dictate">
            <h2 id="how-to-dictate" className="aside-title">
              {t("settings.howTo")}
            </h2>
            <Gestures hotkey={overview?.hotkey ?? null} />
          </section>
          <section className="panel aside-card">
            <div className="setting-text">
              <h2 className="setting-title">{t("settings.setup")}</h2>
              <p className="setting-note">{t("settings.setup.note")}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={onRerun}>
              {t("settings.setup.start")}
            </Button>
          </section>
          <About version={overview?.version ?? null} />
        </aside>
      </div>
    </SectionPage>
  );
}

function HandsFreeNote({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section className="news" aria-labelledby="hands-free-news">
      <span className="news-badge">{t("settings.news")}</span>
      <div className="news-text">
        <h2 id="hands-free-news" className="setting-title">
          {t("settings.handsFreeNote.title")}
        </h2>
        <p>{t("settings.handsFreeNote.body")}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onDismiss}>
        {t("settings.handsFreeNote.dismiss")}
      </Button>
    </section>
  );
}

const themeChoices: { value: Theme | null; label: MessageId; icon: IconName }[] = [
  { value: null, label: "settings.theme.windows", icon: "system" },
  { value: "light", label: "settings.theme.light", icon: "light" },
  { value: "dark", label: "settings.theme.dark", icon: "dark" },
];

function ThemeRow() {
  const [choice, setChoice] = useState<Theme | null | undefined>(undefined);
  const name = useId();

  useEffect(() => {
    void bridge.theme().then(setChoice);
  }, []);

  const choose = (next: Theme | null) => {
    setChoice(next);
    void bridge.setTheme(next).then(setChoice);
  };

  return (
    <section className="setting">
      <div className="setting-text">
        <h2 className="setting-title" id={`${name}-title`}>
          {t("settings.theme")}
        </h2>
        <p className="setting-note">{t("settings.theme.note")}</p>
      </div>
      <fieldset
        className="segmented"
        aria-labelledby={`${name}-title`}
        disabled={choice === undefined}
      >
        {themeChoices.map((option) => (
          <label key={option.icon} className="segmented-option">
            <input
              type="radio"
              name={name}
              checked={choice === option.value}
              onChange={() => {
                choose(option.value);
              }}
            />
            <Icon name={option.icon} className="line-icon" />
            {t(option.label)}
          </label>
        ))}
      </fieldset>
    </section>
  );
}

function About({ version }: { version: string | null }) {
  return (
    <section className="panel about" aria-label={t("settings.about")}>
      <div className="about-identity">
        <Wordmark height={28} />
        <p className="about-tagline">{t("brand.tagline")}</p>
        <p className="about-version version">
          {version && t("settings.about.version", { version })}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void bridge.quit()}>
        {t("settings.quit")}
      </Button>
    </section>
  );
}

function Account() {
  return (
    <SectionPage title="settings.account" intro="settings.account.intro">
      <AccountRow />
    </SectionPage>
  );
}

function AccountRow() {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => void bridge.accountStatus().then(setAccount);
    load();
    return keepListening(() => bridge.onAccountChanged(load));
  }, []);

  const signOut = () => {
    setBusy(true);
    void bridge
      .signOut()
      .then(() => bridge.accountStatus())
      .then(setAccount)
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <section className="panel setting">
      <div className="setting-text">
        <h2 className="setting-title">{t("settings.account")}</h2>
        <p className="setting-note">
          {account === null
            ? "\u00a0"
            : account.signedIn
              ? account.username
                ? t("settings.account.signedInAs", { username: account.username })
                : t("settings.account.signedIn")
              : t("settings.account.signedOut")}
        </p>
      </div>
      {account?.signedIn === true && (
        <button
          type="button"
          className={buttonClass({ variant: "secondary" })}
          disabled={busy}
          onClick={signOut}
        >
          {t(busy ? "settings.account.signingOut" : "settings.account.signOut")}
        </button>
      )}
      {account?.signedIn === false && (
        <button type="button" className={buttonClass()} onClick={() => void bridge.openSignIn()}>
          {t("settings.account.signIn")}
        </button>
      )}
    </section>
  );
}

function ShortcutRow({
  hotkey,
  onSaved,
}: {
  hotkey: string[] | null;
  onSaved: (hotkey: string[]) => void;
}) {
  const [capture, setCapture] = useState<Capture>({ step: "idle" });
  const capturing = useRef(false);

  useEffect(() => {
    capturing.current = capture.step !== "idle";
  }, [capture.step]);

  useEffect(
    () => () => {
      if (capturing.current) void bridge.cancelHotkeyCapture();
    },
    [],
  );
  const [error, setError] = useState<MessageId | null>(null);

  useEffect(
    () =>
      keepListening(() =>
        bridge.onHotkeyCaptureCancelled(() => {
          setCapture({ step: "idle" });
        }),
      ),
    [],
  );

  useEffect(() => {
    if (capture.step !== "listening") return;
    const pressed: string[] = [];
    let finished = false;
    const stop = () => {
      finished = true;
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
      clearTimeout(timeout);
    };
    const codeOf = (event: KeyboardEvent) =>
      event.key === "AltGraph" ? "AltRight" : event.key === "Unidentified" ? "" : event.code;
    const onDown = (event: KeyboardEvent) => {
      event.preventDefault();
      const code = codeOf(event);
      if (finished || code === "" || pressed.includes(code)) return;
      pressed.push(code);
    };
    const onUp = (event: KeyboardEvent) => {
      event.preventDefault();
      if (finished || !pressed.includes(codeOf(event))) return;
      stop();
      bridge
        .proposeHotkey(pressed)
        .then((keys) => {
          setCapture({ step: "proposed", keys });
        })
        .catch((reason: unknown) => {
          setCapture({ step: "idle" });
          setError(problemOf(reason).message);
        });
    };
    const onBlur = () => {
      stop();
      setCapture({ step: "idle" });
      void bridge.cancelHotkeyCapture();
    };
    const timeout = setTimeout(onBlur, CAPTURE_TIMEOUT_MS);
    window.focus();
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return stop;
  }, [capture.step]);

  const start = () => {
    setError(null);
    bridge
      .captureHotkey()
      .then(() => {
        setCapture({ step: "listening" });
      })
      .catch((reason: unknown) => {
        setError(problemOf(reason).message);
      });
  };

  const cancel = () => {
    setCapture({ step: "idle" });
    void bridge.cancelHotkeyCapture();
  };

  const save = () => {
    bridge
      .confirmHotkey()
      .then((saved) => {
        onSaved(saved);
        setCapture({ step: "idle" });
      })
      .catch((reason: unknown) => {
        setCapture({ step: "idle" });
        setError(problemOf(reason).message);
      });
  };

  return (
    <section className="setting" aria-labelledby="shortcut-title">
      <div className="setting-text">
        <h2 className="setting-title" id="shortcut-title">
          {t("settings.shortcut")}
        </h2>
        {capture.step === "listening" && (
          <p className="setting-note" role="status">
            {t("settings.shortcut.listening")}
          </p>
        )}
        {capture.step === "proposed" && (
          <p role="status">
            {t("settings.shortcut.proposeBefore")}{" "}
            <span className="nowrap">
              <Keys keys={capture.keys} />
              {t("settings.shortcut.proposeAfter")}
            </span>
          </p>
        )}
        {capture.step === "idle" && (
          <>
            <p>{hotkey && <Keys keys={hotkey} />}</p>
            <p className="setting-note">{t("settings.shortcut.gesture")}</p>
          </>
        )}
        {error && (
          <p className="tmw-error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      <div className="setting-control">
        {capture.step === "proposed" && (
          <Button size="sm" onClick={save}>
            {t("common.save")}
          </Button>
        )}
        {capture.step === "idle" ? (
          <Button variant="secondary" size="sm" onClick={start}>
            {t("settings.shortcut.change")}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={cancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </section>
  );
}

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type AccountView, bridge, type Overview, keepListening, problemOf } from "../bridge.ts";
import { type MessageId, t } from "../i18n.ts";
import { Keys } from "../Keys.tsx";
import { type SettingsSection, settingsSectionFromSearch } from "../view.ts";

type Capture = { step: "idle" } | { step: "listening" } | { step: "proposed"; keys: string[] };

const CAPTURE_TIMEOUT_MS = 15_000;

const sections: { id: SettingsSection; label: MessageId }[] = [
  { id: "general", label: "settings.general" },
  { id: "account", label: "settings.account" },
];

export function Settings() {
  const [section, setSection] = useState<SettingsSection>(() =>
    settingsSectionFromSearch(window.location.search),
  );

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label={t("settings.sections")}>
        <ul className="settings-nav-list">
          {sections.map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                className="settings-nav-item"
                aria-current={section === id ? "page" : undefined}
                onClick={() => {
                  setSection(id);
                }}
              >
                {t(label)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {section === "general" && <General />}
      {section === "account" && <Account />}
    </div>
  );
}

function SectionPage({
  title,
  intro,
  children,
}: {
  title: MessageId;
  intro: MessageId;
  children: ReactNode;
}) {
  return (
    <main className="page settings-page">
      <header className="page-header">
        <h1>{t(title)}</h1>
        <p className="muted">{t(intro)}</p>
      </header>
      {children}
    </main>
  );
}

function General() {
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
    <SectionPage title="settings.general" intro="settings.general.intro">
      <ShortcutRow
        hotkey={overview?.hotkey ?? null}
        onSaved={(hotkey) => {
          setOverview((current) => current && { ...current, hotkey });
        }}
      />

      <section className="row">
        <label className="row-text" htmlFor="autostart">
          <h2>{t("settings.autostart")}</h2>
          <p className="muted">{t("settings.autostart.note")}</p>
          {autostartError && (
            <p className="error" role="alert">
              {t("settings.autostart.failed")}
            </p>
          )}
        </label>
        <input
          id="autostart"
          type="checkbox"
          role="switch"
          aria-label={t("settings.autostart")}
          className="switch"
          checked={overview?.autostart ?? false}
          disabled={!overview}
          onChange={(event) => {
            toggleAutostart(event.target.checked);
          }}
        />
      </section>

      <footer className="page-footer">
        <button type="button" className="button button-quiet" onClick={() => void bridge.quit()}>
          {t("settings.quit")}
        </button>
      </footer>
    </SectionPage>
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
    <section className="row">
      <div className="row-text">
        <h2>{t("settings.account")}</h2>
        <p className="muted">
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
        <button type="button" className="button" disabled={busy} onClick={signOut}>
          {t(busy ? "settings.account.signingOut" : "settings.account.signOut")}
        </button>
      )}
      {account?.signedIn === false && (
        <button
          type="button"
          className="button button-primary"
          onClick={() => void bridge.openSignIn()}
        >
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
    <section className="row">
      <div className="row-text">
        <h2>{t("settings.shortcut")}</h2>
        {capture.step === "listening" && (
          <p className="muted" role="status">
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
        {capture.step === "idle" && <p>{hotkey && <Keys keys={hotkey} />}</p>}
        {error && (
          <p className="error" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      <div className="row-actions">
        {capture.step === "proposed" && (
          <button type="button" className="button button-primary" onClick={save}>
            {t("common.save")}
          </button>
        )}
        {capture.step === "idle" ? (
          <button type="button" className="button" onClick={start}>
            {t("settings.shortcut.change")}
          </button>
        ) : (
          <button type="button" className="button" onClick={cancel}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </section>
  );
}

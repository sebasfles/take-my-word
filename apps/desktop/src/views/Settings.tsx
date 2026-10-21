import { useEffect, useState } from "react";
import { bridge, type Overview, keepListening } from "../bridge.ts";
import { Keys } from "../Keys.tsx";

type Capture = { step: "idle" } | { step: "listening" } | { step: "proposed"; keys: string[] };

const CAPTURE_TIMEOUT_MS = 15_000;

export function Settings() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const toggleAutostart = (enabled: boolean) => {
    setAutostartError(null);
    bridge
      .setAutostart(enabled)
      .then((autostart) => {
        setOverview((current) => current && { ...current, autostart });
      })
      .catch(() => {
        setAutostartError("Windows did not accept the change. Try again.");
      });
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Take My Word</h1>
        <p className="muted">Hold the shortcut, speak, release.</p>
      </header>

      <ShortcutRow
        hotkey={overview?.hotkey ?? null}
        onSaved={(hotkey) => {
          setOverview((current) => current && { ...current, hotkey });
        }}
      />

      <section className="row">
        <label className="row-text" htmlFor="autostart">
          <h2>Start with Windows</h2>
          <p className="muted">Take My Word waits in the tray, ready when you are.</p>
          {autostartError && (
            <p className="error" role="alert">
              {autostartError}
            </p>
          )}
        </label>
        <input
          id="autostart"
          type="checkbox"
          role="switch"
          aria-label="Start with Windows"
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
          Quit Take My Word
        </button>
      </footer>
    </main>
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
  const [error, setError] = useState<string | null>(null);

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
          setError(reason instanceof Error ? reason.message : String(reason));
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
        setError(String(reason));
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
        setError(String(reason));
      });
  };

  return (
    <section className="row">
      <div className="row-text">
        <h2>Shortcut</h2>
        {capture.step === "listening" && (
          <p className="muted" role="status">
            Press the new shortcut, then release it.
          </p>
        )}
        {capture.step === "proposed" && (
          <p role="status">
            Use <Keys keys={capture.keys} />?
          </p>
        )}
        {capture.step === "idle" && <p>{hotkey && <Keys keys={hotkey} />}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="row-actions">
        {capture.step === "proposed" && (
          <button type="button" className="button button-primary" onClick={save}>
            Save
          </button>
        )}
        {capture.step === "idle" ? (
          <button type="button" className="button" onClick={start}>
            Change
          </button>
        ) : (
          <button type="button" className="button" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

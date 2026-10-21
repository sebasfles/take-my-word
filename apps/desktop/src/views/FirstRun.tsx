import { useEffect, useState } from "react";
import { bridge, type Overview } from "../bridge.ts";
import { Keys } from "../Keys.tsx";

export function FirstRun() {
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const blocked = overview?.microphone === "denied";
  const missing = overview?.microphone === "missing";

  return (
    <main className="page">
      <header className="page-header">
        <h1>Welcome to Take My Word</h1>
        <p className="muted">Talk instead of typing, in any app.</p>
      </header>

      <ol className="steps">
        <li>
          <span className="step-number">1</span>
          <span>Put the cursor where the text should go.</span>
        </li>
        <li>
          <span className="step-number">2</span>
          <span>
            Hold <Keys keys={overview?.hotkey ?? ["Ctrl", "Win"]} /> and speak.
          </span>
        </li>
        <li>
          <span className="step-number">3</span>
          <span>Release. The text is pasted and your clipboard stays as it was.</span>
        </li>
      </ol>

      <section className="note">
        <h2>Microphone</h2>
        <p className="muted">
          Take My Word listens only while you hold the shortcut, and never stores the audio.
        </p>
        {blocked && (
          <div className="callout" role="alert">
            <p>
              Windows is blocking the microphone. Turn on access for desktop apps, then try again.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => void bridge.openMicrophoneSettings()}
            >
              Open microphone settings
            </button>
          </div>
        )}
        {missing && (
          <div className="callout" role="alert">
            <p>No microphone found. Connect one and Take My Word will use it.</p>
          </div>
        )}
      </section>

      <footer className="page-footer">
        <button
          type="button"
          className="button button-primary"
          onClick={() => void bridge.finishFirstRun()}
        >
          Got it
        </button>
      </footer>
    </main>
  );
}

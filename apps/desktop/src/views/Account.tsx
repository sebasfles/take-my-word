import { type SubmitEvent, useCallback, useEffect, useState } from "react";
import { type AccountStep, bridge, type Onboarding, problemOf } from "../bridge.ts";
import { type AccountScreen, accountScreenFromSearch } from "../view.ts";

export function Account() {
  const [screen, setScreen] = useState<AccountScreen>(() =>
    accountScreenFromSearch(window.location.search),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const advance = (step: AccountStep) => {
    setNotice(null);
    if (step === "choosePassword") setScreen("choose-password");
    if (step === "onboarding") setScreen("onboarding");
  };
  const backToSignIn = useCallback((message: string) => {
    setNotice(message);
    setScreen("sign-in");
  }, []);

  if (screen === "choose-password") {
    return <ChoosePassword onStep={advance} onBackToSignIn={backToSignIn} />;
  }
  if (screen === "onboarding") return <PickStyle onBackToSignIn={backToSignIn} />;
  return <SignIn notice={notice} onStep={advance} />;
}

function SignIn({
  notice,
  onStep,
}: {
  notice: string | null;
  onStep: (step: AccountStep) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    bridge
      .signIn(username, password)
      .then((step) => {
        setPassword("");
        onStep(step);
      })
      .catch((reason: unknown) => {
        setError(problemOf(reason).message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Sign in</h1>
        <p className="muted">Use the username and password that came with your invitation.</p>
      </header>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}

function ChoosePassword({
  onStep,
  onBackToSignIn,
}: {
  onStep: (step: AccountStep) => void;
  onBackToSignIn: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== repeated) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    bridge
      .choosePassword(password)
      .then(onStep)
      .catch((reason: unknown) => {
        const problem = problemOf(reason);
        if (problem.backToSignIn) onBackToSignIn(problem.message);
        else setError(problem.message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Choose your password</h1>
        <p className="muted">
          This is your first sign-in: replace the temporary password with your own.
        </p>
      </header>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>New password</span>
          <input
            className="input"
            name="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>Repeat the password</span>
          <input
            className="input"
            name="repeat-password"
            type="password"
            autoComplete="new-password"
            required
            value={repeated}
            onChange={(event) => {
              setRepeated(event.target.value);
            }}
          />
        </label>
        <p className="muted">At least 12 characters, with uppercase, lowercase and numbers.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save and sign in"}
          </button>
        </div>
      </form>
    </main>
  );
}

type Load = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "ready" };

function PickStyle({ onBackToSignIn }: { onBackToSignIn: (message: string) => void }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    bridge
      .onboarding()
      .then((loaded) => {
        if (!current) return;
        setOnboarding(loaded);
        setSelected(loaded.selected);
        setLoad({ kind: "ready" });
      })
      .catch((reason: unknown) => {
        if (!current) return;
        const problem = problemOf(reason);
        if (problem.backToSignIn) onBackToSignIn(problem.message);
        else setLoad({ kind: "failed", message: problem.message });
      });
    return () => {
      current = false;
    };
  }, [attempt, onBackToSignIn]);

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    bridge
      .saveDefaultStyle(selected)
      .catch((reason: unknown) => {
        const problem = problemOf(reason);
        if (problem.backToSignIn) onBackToSignIn(problem.message);
        else setError(problem.message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <main className="page">
      <header className="page-header">
        <h1>Pick your style</h1>
        <p className="muted">
          Every dictation is cleaned up in this style. You can change it later.
        </p>
      </header>
      {load.kind === "loading" && (
        <p className="muted" role="status">
          Loading styles…
        </p>
      )}
      {load.kind === "failed" && (
        <div className="callout" role="alert">
          <p>{load.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              setLoad({ kind: "loading" });
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </div>
      )}
      {load.kind === "ready" && onboarding && (
        <form className="form" onSubmit={save}>
          <fieldset className="choices">
            <legend className="visually-hidden">Default style</legend>
            {onboarding.styles.map((style) => (
              <label key={style.id} className="choice">
                <input
                  type="radio"
                  name="style"
                  value={style.id}
                  checked={selected === style.id}
                  onChange={() => {
                    setSelected(style.id);
                  }}
                />
                <span>{style.name}</span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || selected === ""}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

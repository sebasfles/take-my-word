import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button, Skeleton, TextInput, buttonClass } from "@take-my-word/brand";
import { type AccountStep, bridge, type Onboarding, problemOf } from "../bridge.ts";
import { type Language, type MessageId, t } from "../i18n.ts";
import { LanguageChoices } from "../LanguageChoices.tsx";
import { StyleChoices } from "../StyleChoices.tsx";
import { type AccountScreen, accountScreenFromSearch } from "../view.ts";
import { WindowPage } from "./WindowPage.tsx";

export function Account() {
  const [screen, setScreen] = useState<AccountScreen>(() =>
    accountScreenFromSearch(window.location.search),
  );
  const [notice, setNotice] = useState<MessageId | null>(null);

  const advance = (step: AccountStep) => {
    setNotice(null);
    if (step === "choosePassword") setScreen("choose-password");
    if (step === "onboarding") setScreen("onboarding");
  };
  const backToSignIn = useCallback((message: MessageId) => {
    setNotice(message);
    setScreen("sign-in");
  }, []);

  useEffect(() => {
    if (screen !== "onboarding") void bridge.fitAccount(false, 0, true);
  }, [screen]);

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
  notice: MessageId | null;
  onStep: (step: AccountStep) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(notice);

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
    <WindowPage title={t("signIn.title")} intro={t("signIn.intro")}>
      <form className="window-form" onSubmit={submit}>
        <TextInput
          label={t("signIn.username")}
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          required
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          aria-describedby={error ? "sign-in-error" : undefined}
        />
        <TextInput
          label={t("signIn.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          aria-describedby={error ? "sign-in-error" : undefined}
        />
        {error && (
          <p id="sign-in-error" className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <Button type="submit" block loading={busy}>
          {t(busy ? "signIn.submitting" : "signIn.submit")}
        </Button>
      </form>
    </WindowPage>
  );
}

function ChoosePassword({
  onStep,
  onBackToSignIn,
}: {
  onStep: (step: AccountStep) => void;
  onBackToSignIn: (message: MessageId) => void;
}) {
  const [password, setPassword] = useState("");
  const [repeated, setRepeated] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== repeated) {
      setError("choosePassword.mismatch");
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
    <WindowPage title={t("choosePassword.title")} intro={t("choosePassword.intro")}>
      <form className="window-form" onSubmit={submit}>
        <TextInput
          label={t("choosePassword.new")}
          name="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          hint={t("choosePassword.rules")}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          aria-describedby={error ? "choose-password-error" : undefined}
        />
        <TextInput
          label={t("choosePassword.repeat")}
          name="repeat-password"
          type="password"
          autoComplete="new-password"
          required
          value={repeated}
          onChange={(event) => {
            setRepeated(event.target.value);
          }}
          aria-describedby={error ? "choose-password-error" : undefined}
        />
        {error && (
          <p id="choose-password-error" className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        <Button type="submit" block loading={busy}>
          {t(busy ? "common.saving" : "choosePassword.submit")}
        </Button>
      </form>
    </WindowPage>
  );
}

type Load = { kind: "loading" } | { kind: "failed"; message: MessageId } | { kind: "ready" };

function PickStyle({ onBackToSignIn }: { onBackToSignIn: (message: MessageId) => void }) {
  const fitted = useRef(false);
  const fit = useCallback((height: number) => {
    void bridge.fitAccount(true, height, !fitted.current);
    fitted.current = true;
  }, []);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [selected, setSelected] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    bridge
      .onboarding()
      .then((loaded) => {
        if (!current) return;
        setOnboarding(loaded);
        setSelected(loaded.selected);
        setLanguages(loaded.dictationLanguages);
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
      .saveOnboarding(selected, languages)
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
    <WindowPage title={t("onboarding.title")} intro={t("onboarding.intro")} onHeight={fit}>
      {load.kind === "loading" && (
        <div className="loading" role="status">
          <span className="visually-hidden">{t("onboarding.loading")}</span>
          <Skeleton lines={4} width="100%" />
        </div>
      )}
      {load.kind === "failed" && (
        <div className="failure" role="alert">
          <p>{t(load.message)}</p>
          <button
            type="button"
            className={buttonClass({ variant: "secondary", size: "sm" })}
            onClick={() => {
              setLoad({ kind: "loading" });
              setAttempt((count) => count + 1);
            }}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}
      {load.kind === "ready" && onboarding && (
        <form className="window-form" onSubmit={save}>
          <section className="window-section">
            <h2>{t("dictationLanguages")}</h2>
            <p className="setting-note">{t("dictationLanguages.note")}</p>
            <LanguageChoices chosen={languages} onChange={setLanguages} />
          </section>
          <section className="window-section">
            <h2>{t("styles.default")}</h2>
            <StyleChoices styles={onboarding.styles} selected={selected} onSelect={setSelected} />
          </section>
          {error && (
            <p className="form-error" role="alert">
              {t(error)}
            </p>
          )}
          <Button
            type="submit"
            block
            loading={busy}
            disabled={selected === "" || languages.length === 0}
          >
            {t(busy ? "common.saving" : "common.save")}
          </Button>
        </form>
      )}
    </WindowPage>
  );
}

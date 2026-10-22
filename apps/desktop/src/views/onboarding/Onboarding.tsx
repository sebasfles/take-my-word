import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button, Icon, type IconName, Skeleton, buttonClass } from "@take-my-word/brand";
import {
  type AccountStep,
  bridge,
  type Onboarding as Choices,
  type Overview,
  problemOf,
} from "../../bridge.ts";
import { type Language, type MessageId, t } from "../../i18n.ts";
import { Gestures } from "../../Gestures.tsx";
import { LanguageChoices } from "../../LanguageChoices.tsx";
import { StyleExamples } from "../../StyleExamples.tsx";
import { Frame } from "./Frame.tsx";
import { MicrophoneCheck } from "./MicrophoneCheck.tsx";
import { afterSignIn, type StepId } from "./plan.ts";
import { ChoosePasswordForm, SignInForm } from "./SignIn.tsx";

type Load = { kind: "loading" } | { kind: "failed"; message: MessageId } | { kind: "ready" };

export function Onboarding({
  plan: initial,
  onDone,
}: {
  plan: readonly StepId[];
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<StepId[]>(() => [...initial]);
  const [index, setIndex] = useState(0);
  const [password, setPassword] = useState(false);
  const [notice, setNotice] = useState<MessageId | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [selected, setSelected] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);

  const step = plan[index];
  const last = index === plan.length - 1;

  const finish = useCallback(() => {
    if (plan.includes("ready")) void bridge.finishOnboarding().then(onDone);
    else onDone();
  }, [plan, onDone]);

  const next = useCallback(() => {
    setError(null);
    if (last) finish();
    else setIndex((current) => current + 1);
  }, [last, finish]);

  const back = () => {
    setError(null);
    setIndex((current) => Math.max(0, current - 1));
  };

  const backToSignIn = useCallback(
    (message: MessageId) => {
      setNotice(message);
      setPassword(false);
      setPlan((current) => {
        const at = current.indexOf("signIn");
        if (at >= 0) {
          setIndex(at);
          return current;
        }
        const position = Math.min(index, current.length);
        setIndex(position);
        return [...current.slice(0, position), "signIn", ...current.slice(position)];
      });
    },
    [index],
  );

  const signedIn = (result: AccountStep) => {
    setNotice(null);
    if (result === "choosePassword") {
      setPassword(true);
      return;
    }
    setPassword(false);
    const remaining = afterSignIn(plan, result === "done");
    setPlan(remaining);
    if (index === remaining.length - 1) onDone();
    else setIndex(index + 1);
  };

  useEffect(() => {
    if (step === "hotkey" || step === "ready" || step === "welcome") {
      void bridge.overview().then(setOverview);
    }
  }, [step]);

  const personal = step === "languages" || step === "style";
  useEffect(() => {
    if (!personal || choices !== null) return;
    let current = true;
    bridge
      .onboarding()
      .then((loaded) => {
        if (!current) return;
        setChoices(loaded);
        setSelected(loaded.selected);
        setLanguages(loaded.dictationLanguages);
        setLoad({ kind: "ready" });
      })
      .catch((reason: unknown) => {
        if (!current) return;
        const problem = problemOf(reason);
        if (problem.backToSignIn) backToSignIn(problem.message);
        else setLoad({ kind: "failed", message: problem.message });
      });
    return () => {
      current = false;
    };
  }, [personal, choices, attempt, backToSignIn]);

  const save = () => {
    setBusy(true);
    setError(null);
    bridge
      .saveOnboarding(selected, languages)
      .then(next)
      .catch((reason: unknown) => {
        const problem = problemOf(reason);
        if (problem.backToSignIn) backToSignIn(problem.message);
        else setError(problem.message);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const count = plan.length;
  const position = index + 1;
  const backButton =
    index > 0 && plan[index - 1] !== "signIn" ? (
      <Button variant="ghost" onClick={back}>
        {t("onboarding.back")}
      </Button>
    ) : null;
  const nextButton = (label: MessageId = last ? "onboarding.finish" : "onboarding.next") => (
    <Button onClick={next}>{t(label)}</Button>
  );

  if (step === undefined) return null;

  if (step === "welcome") {
    return (
      <Frame
        step={position}
        count={count}
        title={t("welcome.title")}
        intro={t("welcome.intro")}
        actions={nextButton("welcome.start")}
      >
        <ul className="points">
          <Point icon="general" text="welcome.point.dictate" />
          <Point icon="styles" text="welcome.point.clean" />
          <Point icon="account" text="welcome.point.private" />
        </ul>
      </Frame>
    );
  }

  if (step === "signIn") {
    return password ? (
      <Frame
        step={position}
        count={count}
        title={t("choosePassword.title")}
        intro={t("choosePassword.intro")}
      >
        <ChoosePasswordForm onStep={signedIn} onBackToSignIn={backToSignIn} />
      </Frame>
    ) : (
      <Frame step={position} count={count} title={t("signIn.title")} intro={t("signIn.intro")}>
        <SignInForm notice={notice} onStep={signedIn} />
      </Frame>
    );
  }

  if (step === "microphone") {
    return (
      <Frame
        step={position}
        count={count}
        title={t("microphone.title")}
        intro={t("microphone.intro")}
        actions={
          <>
            {backButton}
            {nextButton()}
          </>
        }
      >
        <MicrophoneCheck />
      </Frame>
    );
  }

  if (step === "hotkey") {
    return (
      <Frame
        step={position}
        count={count}
        wide
        title={t("hotkey.title")}
        intro={t("hotkey.intro")}
        actions={
          <>
            {backButton}
            {nextButton()}
          </>
        }
      >
        <Gestures hotkey={overview?.hotkey ?? null} />
        <Practice />
      </Frame>
    );
  }

  if (step === "ready") {
    return (
      <Frame
        step={position}
        count={count}
        title={t("ready.title")}
        intro={t("ready.intro")}
        actions={
          <>
            {backButton}
            {nextButton("ready.done")}
          </>
        }
      >
        <ul className="points">
          <Point icon="general" text="ready.tray" />
          <Point icon="history" text="ready.try" />
          <Point icon="dictionary" text="ready.dictionary" />
        </ul>
      </Frame>
    );
  }

  const loading = load.kind !== "ready" || choices === null;
  const body = (content: ReactNode) => {
    if (load.kind === "failed") {
      return (
        <div className="failure" role="alert">
          <p>{t(load.message)}</p>
          <button
            type="button"
            className={buttonClass({ variant: "secondary", size: "sm" })}
            onClick={() => {
              setLoad({ kind: "loading" });
              setAttempt((current) => current + 1);
            }}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="loading" role="status">
          <span className="visually-hidden">{t("common.loading")}</span>
          <Skeleton lines={4} width="100%" />
        </div>
      );
    }
    return content;
  };

  if (step === "languages") {
    return (
      <Frame
        step={position}
        count={count}
        title={t("languages.title")}
        intro={t("dictationLanguages.note")}
        actions={
          <>
            {backButton}
            <Button onClick={next} disabled={loading || languages.length === 0}>
              {t("onboarding.next")}
            </Button>
          </>
        }
      >
        {body(<LanguageChoices chosen={languages} onChange={setLanguages} />)}
      </Frame>
    );
  }

  return (
    <Frame
      step={position}
      count={count}
      wide
      title={t("style.title")}
      intro={t("style.intro")}
      actions={
        <>
          {backButton}
          <Button onClick={save} loading={busy} disabled={loading || selected === ""}>
            {t(busy ? "common.saving" : last ? "onboarding.finish" : "onboarding.next")}
          </Button>
        </>
      }
    >
      {body(
        choices && (
          <StyleExamples styles={choices.styles} selected={selected} onSelect={setSelected} />
        ),
      )}
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </Frame>
  );
}

function Point({ icon, text }: { icon: IconName; text: MessageId }) {
  return (
    <li>
      <span className="point-icon">
        <Icon name={icon} className="line-icon" />
      </span>
      <span>{t(text)}</span>
    </li>
  );
}

function Practice() {
  const [text, setText] = useState("");
  return (
    <div className="practice">
      <label className="tmw-label" htmlFor="practice">
        {t("hotkey.practice.label")}
      </label>
      <textarea
        id="practice"
        className="tmw-input tmw-textarea practice-box"
        rows={4}
        placeholder={t("hotkey.practice.placeholder")}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <p className="tmw-hint">{t("hotkey.change")}</p>
    </div>
  );
}

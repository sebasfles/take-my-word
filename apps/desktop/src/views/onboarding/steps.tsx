import { type ReactNode, useState } from "react";
import { Icon, type IconName, Skeleton, buttonClass } from "@take-my-word/brand";
import type { AccountStep } from "../../bridge.ts";
import { bridge } from "../../bridge.ts";
import { Gestures } from "../../Gestures.tsx";
import { type MessageId, t } from "../../i18n.ts";
import { LanguageChoices } from "../../LanguageChoices.tsx";
import { StyleExamples } from "../../StyleExamples.tsx";
import { UserContextChoices } from "../../UserContextChoices.tsx";
import { Actions, Frame } from "./Frame.tsx";
import { useMicrophoneCheck } from "./MicrophoneCheck.tsx";
import type { Draft, Flow } from "./Onboarding.tsx";
import { ChoosePasswordForm, SignInForm } from "./SignIn.tsx";
import { BrandVisual, KeysVisual, LiveMeter, TrayVisual, WelcomeVisual } from "./visuals.tsx";

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

export function WelcomeStep({ flow }: { flow: Flow }) {
  return (
    <Frame
      flow={flow}
      title={t("welcome.title")}
      intro={t("welcome.intro")}
      visual={<WelcomeVisual />}
      actions={<Actions flow={flow} label="welcome.start" />}
    >
      <ul className="points">
        <Point icon="general" text="welcome.point.dictate" />
        <Point icon="styles" text="welcome.point.clean" />
        <Point icon="account" text="welcome.point.private" />
      </ul>
    </Frame>
  );
}

export function SignInStep({ flow }: { flow: Flow }) {
  const [password, setPassword] = useState(false);
  const onStep = (step: AccountStep) => {
    if (step === "choosePassword") {
      setPassword(true);
      return;
    }
    setPassword(false);
    flow.signedIn(step);
  };
  if (password) {
    return (
      <Frame
        flow={flow}
        title={t("choosePassword.title")}
        intro={t("choosePassword.intro")}
        visual={<BrandVisual />}
      >
        <ChoosePasswordForm
          onStep={onStep}
          onBackToSignIn={(message) => {
            setPassword(false);
            flow.backToSignIn(message);
          }}
        />
      </Frame>
    );
  }
  return (
    <Frame flow={flow} title={t("signIn.title")} intro={t("signIn.intro")} visual={<BrandVisual />}>
      <SignInForm notice={flow.notice} onStep={onStep} />
    </Frame>
  );
}

export function MicrophoneStep({ flow }: { flow: Flow }) {
  const { levels, status } = useMicrophoneCheck();
  const blocked = status === "denied";
  const missing = status === "missing";
  return (
    <Frame
      flow={flow}
      title={t("microphone.title")}
      intro={t("microphone.intro")}
      visual={<LiveMeter levels={levels} label={t("microphone.meter")} />}
      actions={<Actions flow={flow} />}
    >
      {blocked || missing ? (
        <div className="failure" role="alert">
          <p>{t(blocked ? "microphone.blocked" : "microphone.missing")}</p>
          {blocked && (
            <button
              type="button"
              className={buttonClass({ variant: "secondary", size: "sm" })}
              onClick={() => void bridge.openMicrophoneSettings()}
            >
              {t("microphone.openSettings")}
            </button>
          )}
        </div>
      ) : (
        <p className="setting-note">{t("microphone.private")}</p>
      )}
    </Frame>
  );
}

export function HotkeyStep({ flow }: { flow: Flow }) {
  const [text, setText] = useState("");
  const hotkey = flow.overview?.hotkey ?? null;
  return (
    <Frame
      flow={flow}
      title={t("hotkey.title")}
      intro={t("hotkey.intro")}
      visual={<KeysVisual hotkey={hotkey} />}
      actions={<Actions flow={flow} />}
    >
      <Gestures hotkey={hotkey} />
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
    </Frame>
  );
}

function Loaded({ draft, children }: { draft: Draft; children: ReactNode }) {
  if (draft.load.kind === "failed") {
    return (
      <div className="failure" role="alert">
        <p>{t(draft.load.message)}</p>
        <button
          type="button"
          className={buttonClass({ variant: "secondary", size: "sm" })}
          onClick={draft.retry}
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }
  if (draft.load.kind === "loading" || draft.choices === null) {
    return (
      <div className="loading" role="status">
        <span className="visually-hidden">{t("common.loading")}</span>
        <Skeleton lines={4} width="100%" />
      </div>
    );
  }
  return children;
}

function SaveError({ flow }: { flow: Flow }) {
  if (flow.error === null) return null;
  return (
    <p className="form-error" role="alert">
      {t(flow.error)}
    </p>
  );
}

export function LanguagesStep({ flow }: { flow: Flow }) {
  const { draft } = flow;
  return (
    <Frame
      flow={flow}
      title={t("languages.title")}
      intro={t("dictationLanguages.note")}
      actions={
        <Actions
          flow={flow}
          disabled={draft.load.kind !== "ready" || draft.languages.length === 0}
        />
      }
    >
      <Loaded draft={draft}>
        <LanguageChoices chosen={draft.languages} onChange={draft.setLanguages} />
      </Loaded>
      <SaveError flow={flow} />
    </Frame>
  );
}

export function ContextStep({ flow }: { flow: Flow }) {
  const { draft } = flow;
  return (
    <Frame
      flow={flow}
      title={t("context.title")}
      intro={t("context.intro")}
      visual={<BrandVisual />}
      actions={
        <Actions
          flow={flow}
          disabled={draft.load.kind !== "ready"}
          onSkip={() => {
            draft.skipContext();
            flow.next();
          }}
        />
      }
    >
      <Loaded draft={draft}>
        <UserContextChoices value={draft.context} onChange={draft.setContext} />
      </Loaded>
      <SaveError flow={flow} />
    </Frame>
  );
}

export function StyleStep({ flow }: { flow: Flow }) {
  const { draft } = flow;
  return (
    <Frame
      flow={flow}
      title={t("style.title")}
      intro={t("style.intro")}
      actions={
        <Actions flow={flow} disabled={draft.load.kind !== "ready" || draft.selected === ""} />
      }
    >
      <Loaded draft={draft}>
        {draft.choices && (
          <StyleExamples
            styles={draft.choices.styles}
            selected={draft.selected}
            onSelect={draft.select}
          />
        )}
      </Loaded>
      <SaveError flow={flow} />
    </Frame>
  );
}

export function ReadyStep({ flow }: { flow: Flow }) {
  return (
    <Frame
      flow={flow}
      title={t("ready.title")}
      intro={t("ready.intro")}
      visual={<TrayVisual />}
      actions={<Actions flow={flow} label="ready.done" />}
    >
      <ul className="points">
        <Point icon="general" text="ready.tray" />
        <Point icon="history" text="ready.try" />
        <Point icon="dictionary" text="ready.dictionary" />
      </ul>
    </Frame>
  );
}

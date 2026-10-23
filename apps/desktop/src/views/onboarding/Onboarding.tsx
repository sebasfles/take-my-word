import { type ComponentType, useCallback, useEffect, useState } from "react";
import {
  type AccountStep,
  bridge,
  type Onboarding as Choices,
  type Overview,
  problemOf,
} from "../../bridge.ts";
import { emptyUserContext, type UserContext } from "@take-my-word/shared";
import type { Language, MessageId } from "../../i18n.ts";
import { afterSignIn, isLastUserStep, isUserStep, type StepId, steps } from "./plan.ts";
import {
  ContextStep,
  HotkeyStep,
  LanguagesStep,
  MicrophoneStep,
  ReadyStep,
  SignInStep,
  StyleStep,
  WelcomeStep,
} from "./steps.tsx";

export type Load = { kind: "loading" } | { kind: "failed"; message: MessageId } | { kind: "ready" };

export interface Draft {
  choices: Choices | null;
  load: Load;
  retry: () => void;
  selected: string;
  select: (id: string) => void;
  languages: Language[];
  setLanguages: (languages: Language[]) => void;
  context: UserContext;
  setContext: (context: UserContext) => void;
  skipContext: () => void;
}

export interface Flow {
  position: number;
  count: number;
  canGoBack: boolean;
  last: boolean;
  busy: boolean;
  error: MessageId | null;
  next: () => void;
  back: () => void;
  overview: Overview | null;
  notice: MessageId | null;
  signedIn: (step: AccountStep) => void;
  backToSignIn: (message: MessageId) => void;
  draft: Draft;
}

const views: Record<StepId, ComponentType<{ flow: Flow }>> = {
  welcome: WelcomeStep,
  signIn: SignInStep,
  microphone: MicrophoneStep,
  hotkey: HotkeyStep,
  languages: LanguagesStep,
  context: ContextStep,
  style: StyleStep,
  ready: ReadyStep,
};

export function Onboarding({
  plan: initial,
  onDone,
}: {
  plan: readonly StepId[];
  onDone: () => void;
}) {
  const [plan, setPlan] = useState<StepId[]>(() => [...initial]);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState<MessageId | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [selected, setSelected] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [context, setContext] = useState<UserContext>(emptyUserContext);
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageId | null>(null);

  const step = plan[index];
  const last = index === plan.length - 1;

  useEffect(() => {
    void bridge.overview().then(setOverview);
  }, []);

  const backToSignIn = useCallback(
    (message: MessageId) => {
      setNotice(message);
      setPlan((current) => {
        const at = current.indexOf("signIn");
        if (at >= 0) {
          setIndex(at);
          return current;
        }
        setIndex(index);
        return [...current.slice(0, index), "signIn", ...current.slice(index)];
      });
    },
    [index],
  );

  const advance = useCallback(() => {
    setError(null);
    if (!last) {
      setIndex((current) => current + 1);
      return;
    }
    if (plan.includes("ready")) void bridge.finishOnboarding().then(onDone);
    else onDone();
  }, [last, plan, onDone]);

  const next = useCallback(() => {
    if (step === undefined || !isLastUserStep(steps, plan, step)) {
      advance();
      return;
    }
    setBusy(true);
    setError(null);
    bridge
      .saveOnboarding(selected, languages, context)
      .then(advance)
      .catch((reason: unknown) => {
        const problem = problemOf(reason);
        if (problem.backToSignIn) backToSignIn(problem.message);
        else setError(problem.message);
      })
      .finally(() => {
        setBusy(false);
      });
  }, [step, plan, selected, languages, context, advance, backToSignIn]);

  const signedIn = (result: AccountStep) => {
    setNotice(null);
    const remaining = afterSignIn(steps, plan, result === "done");
    setPlan(remaining);
    if (index === remaining.length - 1) onDone();
    else setIndex(index + 1);
  };

  const personal = step !== undefined && isUserStep(steps, step);
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
        setContext(loaded.context);
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

  if (step === undefined) return null;
  const View = views[step];
  const previous = plan[index - 1];
  return (
    <View
      flow={{
        position: index + 1,
        count: plan.length,
        canGoBack: previous !== undefined && previous !== "signIn",
        last,
        busy,
        error,
        next,
        back: () => {
          setError(null);
          setIndex((current) => Math.max(0, current - 1));
        },
        overview,
        notice,
        signedIn,
        backToSignIn,
        draft: {
          choices,
          load,
          retry: () => {
            setLoad({ kind: "loading" });
            setAttempt((current) => current + 1);
          },
          selected,
          select: setSelected,
          languages,
          setLanguages,
          context,
          setContext,
          skipContext: () => {
            setContext(choices?.context ?? emptyUserContext);
          },
        },
      }}
    />
  );
}

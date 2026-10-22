import { useCallback, useEffect, useRef, useState } from "react";
import { type AppState, bridge, keepListening } from "../bridge.ts";
import { Onboarding } from "./onboarding/Onboarding.tsx";
import { planFor, type StepId } from "./onboarding/plan.ts";
import { Settings } from "./Settings.tsx";

type Phase =
  | { kind: "loading" }
  | { kind: "onboarding"; plan: StepId[] }
  | { kind: "app"; handsFreeNote: boolean };

const phaseOf = (state: AppState, rerun: boolean): Phase => {
  const plan = planFor(state, rerun);
  return plan.length > 0
    ? { kind: "onboarding", plan }
    : { kind: "app", handsFreeNote: state.handsFreeNote };
};

export function Main() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [round, setRound] = useState(0);
  const inApp = useRef(false);

  useEffect(() => {
    inApp.current = phase.kind === "app";
  }, [phase.kind]);

  const route = useCallback((rerun: boolean) => {
    void bridge.appState().then((state) => {
      setRound((current) => current + 1);
      setPhase(phaseOf(state, rerun));
    });
  }, []);

  useEffect(() => {
    route(false);
  }, [route]);

  useEffect(
    () =>
      keepListening(() =>
        bridge.onAccountChanged((signedIn) => {
          if (!signedIn && inApp.current) route(false);
        }),
      ),
    [route],
  );

  if (phase.kind === "loading") return null;
  if (phase.kind === "onboarding") {
    return (
      <Onboarding
        key={round}
        plan={phase.plan}
        onDone={() => {
          route(false);
        }}
      />
    );
  }
  return (
    <Settings
      handsFreeNote={phase.handsFreeNote}
      onRerun={() => {
        route(true);
      }}
    />
  );
}

import { useEffect, useState } from "react";
import { OverlayPill } from "@take-my-word/brand";
import { bridge, type OverlayState, keepListening } from "../bridge.ts";
import { t } from "../i18n.ts";

const BARS = 9;
const flat = () => Array.from({ length: BARS }, () => 0);

export function Overlay() {
  const [overlay, setOverlay] = useState<OverlayState>({ state: "hidden" });
  const [levels, setLevels] = useState(flat);

  useEffect(
    () =>
      keepListening(() =>
        bridge.onOverlay((state) => {
          if (state.state === "listening") setLevels(flat());
          setOverlay(state);
        }),
      ),
    [],
  );

  useEffect(
    () =>
      keepListening(() =>
        bridge.onOverlayLevel((level) => {
          setLevels((current) => [...current.slice(1), level]);
        }),
      ),
    [],
  );

  if (overlay.state === "hidden") return null;

  if (overlay.state === "error") {
    return (
      <div className="overlay overlay-dismissable" onClick={() => void bridge.dismissOverlay()}>
        <OverlayPill
          state="error"
          indicator="state"
          label={t(overlay.message)}
          action={
            overlay.action === "microphoneSettings" && (
              <button
                type="button"
                className="tmw-overlay-action"
                onClick={(event) => {
                  event.stopPropagation();
                  void bridge.openMicrophoneSettings();
                }}
              >
                {t("overlay.openSettings")}
              </button>
            )
          }
        />
      </div>
    );
  }

  const listening = overlay.state === "listening";
  return (
    <div className="overlay">
      <OverlayPill
        state={overlay.state}
        indicator="state"
        label={t(listening ? "overlay.listening" : "overlay.processing")}
        {...(listening && { levels })}
      />
    </div>
  );
}

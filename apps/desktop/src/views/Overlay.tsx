import { useEffect, useState } from "react";
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
          setLevels((current) => [...current.slice(1), Math.min(1, Math.max(0, level))]);
        }),
      ),
    [],
  );

  if (overlay.state === "hidden") return null;

  if (overlay.state === "error") {
    return (
      <div className="pill pill-error" role="alert" onClick={() => void bridge.dismissOverlay()}>
        <span className="pill-icon pill-icon-error" aria-hidden="true">
          !
        </span>
        <span className="pill-text">{t(overlay.message)}</span>
        {overlay.action === "microphoneSettings" && (
          <button
            type="button"
            className="pill-link"
            onClick={(event) => {
              event.stopPropagation();
              void bridge.openMicrophoneSettings();
            }}
          >
            {t("overlay.openSettings")}
          </button>
        )}
      </div>
    );
  }

  const listening = overlay.state === "listening";
  return (
    <div className="pill" role="status">
      <span
        className={listening ? "pill-icon pill-icon-listening" : "pill-icon pill-icon-processing"}
        aria-hidden="true"
      />
      <span className="pill-text">{t(listening ? "overlay.listening" : "overlay.processing")}</span>
      {listening && (
        <span className="wave" aria-hidden="true">
          {levels.map((level, index) => (
            <span
              key={index}
              className="wave-bar"
              style={{ transform: `scaleY(${String(0.15 + level * 0.85)})` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

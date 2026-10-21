import { useEffect, useState } from "react";
import { bridge, type OverlayState, keepListening } from "../bridge.ts";

export function Overlay() {
  const [overlay, setOverlay] = useState<OverlayState>({ state: "hidden" });

  useEffect(() => keepListening(() => bridge.onOverlay(setOverlay)), []);

  if (overlay.state === "hidden") return null;

  if (overlay.state === "error") {
    return (
      <div className="pill pill-error" role="alert" onClick={() => void bridge.dismissOverlay()}>
        <span className="pill-icon pill-icon-error" aria-hidden="true">
          !
        </span>
        <span className="pill-text">{overlay.message}</span>
        {overlay.action === "microphoneSettings" && (
          <button
            type="button"
            className="pill-link"
            onClick={(event) => {
              event.stopPropagation();
              void bridge.openMicrophoneSettings();
            }}
          >
            Open settings
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
      <span className="pill-text">{listening ? "Listening" : "Processing"}</span>
    </div>
  );
}

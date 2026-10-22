import { useEffect, useState } from "react";
import { Waveform, buttonClass } from "@take-my-word/brand";
import { bridge, keepListening, type MicStatus } from "../../bridge.ts";
import { t } from "../../i18n.ts";

const BARS = 24;
const flat = () => Array.from({ length: BARS }, () => 0);

export function MicrophoneCheck() {
  const [levels, setLevels] = useState(flat);
  const [status, setStatus] = useState<MicStatus>("unknown");

  useEffect(() => {
    let current = true;
    void bridge.checkMicrophone(true).then((started) => {
      if (current) setStatus(started);
    });
    const stopLevels = keepListening(() =>
      bridge.onMicrophoneLevel((level) => {
        setLevels((previous) => [...previous.slice(1), level]);
      }),
    );
    const stopStatus = keepListening(() => bridge.onMicrophoneStatus(setStatus));
    return () => {
      current = false;
      stopLevels();
      stopStatus();
      void bridge.checkMicrophone(false);
    };
  }, []);

  if (status === "denied" || status === "missing") {
    const blocked = status === "denied";
    return (
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
    );
  }

  return (
    <div className="microphone-check">
      <div className="microphone-meter" role="img" aria-label={t("microphone.meter")}>
        <Waveform levels={levels} />
      </div>
      <p className="setting-note">{t("microphone.private")}</p>
    </div>
  );
}

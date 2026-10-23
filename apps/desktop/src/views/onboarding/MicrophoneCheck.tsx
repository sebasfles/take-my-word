import { useEffect, useState } from "react";
import { bridge, keepListening, type MicStatus } from "../../bridge.ts";

const BARS = 32;
const flat = () => Array.from({ length: BARS }, () => 0);

export function useMicrophoneCheck() {
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

  return { levels, status };
}

export type UnlistenFn = () => void;

const overlayStates: Record<string, unknown> = {
  listening: { state: "listening" },
  processing: { state: "processing" },
  error: {
    state: "error",
    message: "Can't reach Take My Word. Check your connection.",
    action: null,
  },
  "error-microphone": {
    state: "error",
    message: "Windows blocks the microphone.",
    action: "microphoneSettings",
  },
};

export function listen(
  event: string,
  handler: (event: { payload: unknown }) => void,
): Promise<UnlistenFn> {
  const requested = new URLSearchParams(window.location.search).get("overlay");
  const state = requested === null ? undefined : overlayStates[requested];
  if (event === "overlay" && state !== undefined) {
    setTimeout(() => {
      handler({ payload: state });
    }, 0);
  }
  return Promise.resolve(() => undefined);
}

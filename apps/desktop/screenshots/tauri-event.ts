export type UnlistenFn = () => void;

const overlayStates: Record<string, unknown> = {
  listening: { state: "listening" },
  processing: { state: "processing" },
  error: {
    state: "error",
    message: "Can't reach Take My Word. Check your connection.",
    action: null,
  },
  "error-quota": {
    state: "error",
    message: "You've reached today's dictation limit.",
    action: null,
  },
  "error-too-long": { state: "error", message: "That dictation was too long.", action: null },
  "error-format": {
    state: "error",
    message: "That recording format isn't supported.",
    action: null,
  },
  "error-sign-in": {
    state: "error",
    message: "Sign in to Take My Word to dictate.",
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

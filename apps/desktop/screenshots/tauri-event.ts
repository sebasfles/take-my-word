export type UnlistenFn = () => void;

const overlayStates: Record<string, unknown> = {
  listening: { state: "listening" },
  "listening-silent": { state: "listening" },
  "hands-free": { state: "handsFree" },
  processing: { state: "processing" },
  error: {
    state: "error",
    message: "overlay.unreachable",
    action: null,
  },
  "error-quota": {
    state: "error",
    message: "overlay.quota",
    action: null,
  },
  "error-too-long": { state: "error", message: "overlay.tooLong", action: null },
  "error-format": {
    state: "error",
    message: "overlay.format",
    action: null,
  },
  "error-sign-in": {
    state: "error",
    message: "overlay.signIn",
    action: null,
  },
  "error-microphone": {
    state: "error",
    message: "overlay.microphoneBlocked",
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
      handler({ payload: { seq: 1, ...(state as object) } });
    }, 0);
  }
  if (event === "microphone-level") {
    Array.from({ length: 24 }, (_, index) => 0.25 + 0.6 * Math.abs(Math.sin(index * 0.7))).forEach(
      (level, index) => {
        setTimeout(
          () => {
            handler({ payload: level });
          },
          20 + index * 5,
        );
      },
    );
  }
  if (event === "overlay-level" && (requested === "listening" || requested === "hands-free")) {
    [0.1, 0.55, 0.8, 0.65, 0.3, 0.7, 0.9, 0.5, 0.2].forEach((level, index) => {
      setTimeout(
        () => {
          handler({ payload: level });
        },
        20 + index * 5,
      );
    });
  }
  return Promise.resolve(() => undefined);
}

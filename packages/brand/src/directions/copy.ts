export interface Segment {
  text: string;
  kind?: "filler" | "fixed";
}

export const copy = {
  tagline: "Tu palabra, nuestra orden.",
  kicker: "Dictado por voz para Windows",
  headline: ["Dilo una vez.", "Queda escrito."] as const,
  lead: "Mantén Ctrl + Win, habla y suelta. Take My Word transcribe lo que dijiste, quita las muletillas y pega el texto limpio en la app que tienes delante.",
  download: "Descargar para Windows",
  version: "Versión 0.1.1 · Windows 10 y 11",
  soon: "macOS y Linux, pronto.",
  signIn: "Iniciar sesión",
  nav: ["Cómo funciona", "Privacidad"] as const,
  locale: "EN",
  demo: {
    label:
      "Demostración: se mantienen Ctrl y Win, se dicta un mensaje y aparece escrito sin muletillas.",
    app: "Chat",
    channel: "#despliegues",
    keys: ["Ctrl", "Win"] as const,
    listening: "Escuchando",
    cleaning: "Limpiando",
    said: "Lo que dijiste",
    written: "Lo que se escribe",
    chunks: [
      [{ text: "eh, ", kind: "filler" }, { text: "mañana a las diez, " }],
      [{ text: "este, ", kind: "filler" }, { text: "revisamos el despliegue de " }],
      [
        { text: "cubernetes", kind: "fixed" },
        { text: " con " },
        { text: "raul", kind: "fixed" },
        { text: ", " },
      ],
      [{ text: "o sea, ", kind: "filler" }, { text: "si puede" }],
    ] satisfies Segment[][],
    clean: "Mañana a las diez revisamos el despliegue de Kubernetes con Raúl, si puede.",
  },
};

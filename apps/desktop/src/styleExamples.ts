import type { BuiltinStyleId } from "@take-my-word/shared";
import type { Language } from "./i18n.ts";

export interface StyleExample {
  said: string;
  styles: Record<BuiltinStyleId, string>;
}

export const styleExamples: Record<Language, StyleExample> = {
  es: {
    said: "Hola Marta, oye, te quería decir que mañana no llego a la reunión de las 10 porque tengo que ir al médico, así que si la pueden mover para la tarde sería genial, gracias.",
    styles: {
      plain:
        "Hola Marta, te quería decir que mañana no llego a la reunión de las 10 porque tengo que ir al médico, así que si la pueden mover para la tarde sería genial. Gracias.",
      casual:
        "Hola Marta, te quería decir que mañana no llego a la reunión de las 10 porque tengo que ir al médico. Así que si la pueden mover para la tarde sería genial. Gracias.",
      formal:
        "Marta, quería decirle que mañana no llegaré a la reunión de las 10 porque tengo que ir al médico, así que si pueden moverla para la tarde, sería genial. Gracias.",
    },
  },
  en: {
    said: "Um hi Marta, so I wanted to let you know I can't make it to the 10 o'clock meeting tomorrow because I have a doctor's appointment, so if you guys could move it to the afternoon that would be great, thanks.",
    styles: {
      plain:
        "Hi Marta, I wanted to let you know I can't make it to the 10 o'clock meeting tomorrow because I have a doctor's appointment, so if you could move it to the afternoon, that would be great. Thanks.",
      casual:
        "Hi Marta, I wanted to let you know I can’t make it to the 10 o’clock meeting tomorrow because I have a doctor’s appointment. So if you guys could move it to the afternoon, that would be great. Thanks.",
      formal:
        "Hi Marta, I wanted to let you know that I cannot make it to the 10 o'clock meeting tomorrow because I have a doctor's appointment. If you could move it to the afternoon, that would be great. Thank you.",
    },
  },
};

import type { BuiltinStyleId } from "@take-my-word/shared";
import type { Language } from "./i18n.ts";

export interface StyleExample {
  said: string;
  styles: Record<BuiltinStyleId, string>;
}

export const styleExamples: Record<Language, StyleExample> = {
  es: {
    said: "Estimado, le escribo para avisarle que la factura que me mandó tiene un error en el monto, así que le agradecería que me mande una nueva cuando pueda.",
    styles: {
      plain:
        "Estimado, le escribo para avisarle que la factura que me mandó tiene un error en el monto, así que le agradecería que me mande una nueva cuando pueda.",
      casual:
        "Estimado, le escribo para avisarle que la factura que me mandó tiene un error en el monto. Así que le agradecería que me mande una nueva cuando pueda.",
      formal:
        "Estimado, le escribo para avisarle que la factura que me mandó tiene un error en el monto; por ello, le agradecería que me enviara una nueva cuando pueda.",
    },
  },
  en: {
    said: "Hey, so I'm not gonna make it Saturday, something urgent came up at work, but if you want we can grab a drink on Sunday and talk about it.",
    styles: {
      plain:
        "I'm not going to make it Saturday. Something urgent came up at work, but if you want, we can grab a drink on Sunday and talk about it.",
      casual:
        "I'm not gonna make it Saturday. Something urgent came up at work, but if you want, we can grab a drink on Sunday and talk about it.",
      formal:
        "I will not be able to make it on Saturday. Something urgent came up at work. If you would like, we can grab a drink on Sunday and talk about it.",
    },
  },
};

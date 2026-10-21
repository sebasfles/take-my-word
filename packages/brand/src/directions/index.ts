import type { Tokens } from "../tokens.ts";
import { tokens as a } from "./a/tokens.ts";
import { tokens as b } from "./b/tokens.ts";
import { tokens as c } from "./c/tokens.ts";

export interface Direction {
  id: "a" | "b" | "c";
  name: string;
  summary: string;
  tokens: Tokens;
}

export const directions: Direction[] = [
  {
    id: "a",
    name: "Tinta",
    summary:
      "Editorial y cálida: papel, tinta y un terracota firme. Fraunces para titular, Instrument Sans para leer; la comilla que se vuelve onda.",
    tokens: a,
  },
  {
    id: "b",
    name: "Pulso",
    summary:
      "Segura y con volumen: crema, tinta y un caléndula que se ve de lejos. Bricolage Grotesque condensada y Figtree; el globo de diálogo con la onda dentro.",
    tokens: b,
  },
  {
    id: "c",
    name: "Eco",
    summary:
      "Serena y literaria: marfil, verde laurel y mucho aire. Instrument Serif con cursiva y Schibsted Grotesk; la coma que suena en ondas.",
    tokens: c,
  },
];

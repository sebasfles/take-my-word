# Take My Word brand

The single source of the identity and the design system, consumed by `apps/web` and, from 0011, `apps/desktop`.
Everything here is TypeScript source and plain CSS: no build step, no runtime CSS-in-JS, the same files work in Next and Vite.

## Use it

```ts
import "@take-my-word/brand/index.css";
import { Button, Mark, OverlayPill, Wordmark, tokens } from "@take-my-word/brand";
```

`index.css` brings the fonts, the tokens as custom properties on `:root`, the waveform and the primitives.
A Next app imports `web.css` instead and loads the same woff2 files with `next/font/local`, which preloads them and sets `--font-face-display` and `--font-face-text`; the font tokens read those first.
The theme follows the system; `data-theme="light"` or `data-theme="dark"` on `<html>` forces one.
Apps use tokens only: `apps/web` has a test that rejects literal colors, fonts, font sizes, spacing, radii, shadows and durations.

## Files and scripts

| Path                                   | What                                                                                                     | Regenerate      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| `src/tokens.ts`                        | Every token, authored once                                                                               |                 |
| `src/tokens.css`                       | Generated custom properties; a test fails if it drifts                                                   | `pnpm generate` |
| `src/contrast.ts`                      | The text and control pairs that must meet WCAG AA in both themes                                         |                 |
| `src/fonts/`, `src/fonts.css`          | Fraunces and Instrument Sans, Latin subset with Spanish, with metric-matched fallbacks; OFL next to them | `pnpm fonts`    |
| `src/mark-geometry.ts`                 | The mark as paths: a full glyph and a pixel-aligned one for 48 px and below                              |                 |
| `src/assets/`, `src/wordmark-paths.ts` | SVG masters, outlined wordmark, icons, `.ico` files, the OG card                                         | `pnpm assets`   |
| `src/ui/`                              | Primitives with keyboard and ARIA tests                                                                  |                 |

`pnpm fonts` and `pnpm assets` download the pinned Google Fonts sources; outputs are committed.

## Logo

The mark is a quotation mark that turns into a sound wave: what you say becomes written.
The wordmark sets "Take My" in Fraunces and "Word" in Fraunces italic in the accent ink.
Keep clear space around the lockup equal to the height of the mark's tallest bar.
Below 48 px use the small glyph (two bars); `Mark`, `AppIcon` and `Wordmark` switch on their own.
Use the accent mark on paper, the paper mark on ink or on the accent, and the ink mark when color is not available.
Do not stretch, rotate, outline, recolor outside the palette, add effects, or set the wordmark in another face.

## Color

Terracotta is the signature: one accent with a full scale, on warm paper neutrals.
Use the accent for the main action, the mark, focus rings and one loud band per page; everything else stays neutral.
Text sits on `bg`, `surface`, `sunken`, `accent-soft` or the accent with `on-accent`; every pair in `contrast.ts` meets AA and the test keeps it that way.
Success, warning, error and info are for status only, never for decoration.
The overlay pill uses its own `overlay` roles so it reads the same over any app.

## Type

Fraunces carries the voice: headlines, the written text in demos, quotes.
Instrument Sans carries the interface: body, labels, controls.
Never set long reading text in Fraunces below `text-lg`, and never use more than one italic emphasis per heading.

## Motion

The waveform is the signature: it moves only while someone is speaking.
Durations and easings come from the tokens; under `prefers-reduced-motion` demos rest on a still frame and nothing loops.

## Voice and tone

Write like a calm, competent colleague: short sentences, plain words, the action first.

English:

- Say what happens, not what the product is: "Hold Ctrl + Win, speak, release."
- Use "you"; keep "we" for what the service does or failed to do: "We could not reach the service."
- Errors say what went wrong and what to do next, without blame or exclamation marks.
- Empty states invite the next step: "No terms yet. Add them from the desktop app."
- No jargon the user did not bring: say "clean text", not "refined output".
- Tagline: "Your Word, Our Command."

Español:

- Tutea, con calidez y sin rodeos: "Mantén Ctrl + Win, habla y suelta."
- Español neutro de América; evita regionalismos y anglicismos cuando hay palabra propia.
- Usa "tú"; reserva "nosotros" para lo que hace o no pudo hacer el servicio: "No pudimos conectar con el servicio."
- Los errores dicen qué pasó y qué hacer, sin culpas ni signos de exclamación.
- Los estados vacíos invitan al siguiente paso: "Aún no tienes términos. Agrégalos desde la app de escritorio."
- Escribe bien los nombres: tildes, eñes y diéresis siempre.
- Lema: "Tu palabra, nuestra orden."

Both languages are always complete and say the same thing; neither is a translation of the other's wording.

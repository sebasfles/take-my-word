import { Hero as HeroA } from "./a/hero.tsx";
import { AppIcon as AppIconA, Mark as MarkA, Wordmark as WordmarkA } from "./a/mark.tsx";
import { Hero as HeroB } from "./b/hero.tsx";
import { AppIcon as AppIconB, Mark as MarkB, Wordmark as WordmarkB } from "./b/mark.tsx";
import { Hero as HeroC } from "./c/hero.tsx";
import { AppIcon as AppIconC, Mark as MarkC, Wordmark as WordmarkC } from "./c/mark.tsx";
import type { DirectionViews } from "./board.tsx";
import type { Direction } from "./index.ts";

export const views: Record<Direction["id"], DirectionViews> = {
  a: { Mark: MarkA, AppIcon: AppIconA, Wordmark: WordmarkA, Hero: HeroA },
  b: { Mark: MarkB, AppIcon: AppIconB, Wordmark: WordmarkB, Hero: HeroB },
  c: { Mark: MarkC, AppIcon: AppIconC, Wordmark: WordmarkC, Hero: HeroC },
};

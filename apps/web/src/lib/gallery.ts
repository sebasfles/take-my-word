import { directions, type Direction } from "@take-my-word/brand/directions/index.ts";

export function galleryEnabled(env: Record<string, string | undefined>): boolean {
  return env.TMW_GALLERY === "1";
}

export function findDirection(id: string): Direction | undefined {
  return directions.find((direction) => direction.id === id);
}

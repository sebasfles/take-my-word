import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Direction } from "@take-my-word/brand/directions/index.ts";
import { findDirection, galleryEnabled } from "../gallery.ts";

export async function requireGallery(): Promise<void> {
  await connection();
  if (!galleryEnabled(process.env)) notFound();
}

export async function galleryDirection(params: Promise<{ id: string }>): Promise<Direction> {
  await requireGallery();
  const direction = findDirection((await params).id);
  if (direction === undefined) notFound();
  return direction;
}

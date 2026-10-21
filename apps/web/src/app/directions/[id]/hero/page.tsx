import { views } from "@take-my-word/brand/directions/views.ts";
import { galleryDirection } from "@/lib/server/gallery.ts";

export default async function DirectionHeroPage({ params }: { params: Promise<{ id: string }> }) {
  const direction = await galleryDirection(params);
  const { Hero } = views[direction.id];
  return (
    <div data-direction={direction.id} id="top">
      <Hero />
    </div>
  );
}

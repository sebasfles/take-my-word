import { Board } from "@take-my-word/brand/directions/board.tsx";
import { views } from "@take-my-word/brand/directions/views.ts";
import { galleryDirection } from "@/lib/server/gallery.ts";

export default async function DirectionBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const direction = await galleryDirection(params);
  return (
    <div data-direction={direction.id}>
      <Board direction={direction} views={views[direction.id]} />
    </div>
  );
}

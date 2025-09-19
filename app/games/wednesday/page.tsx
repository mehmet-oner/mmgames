import type { Metadata } from "next";
import DrawingMatchGame from "./drawing-match-game";

export const metadata: Metadata = {
  title: "Chroma Trace · MM Games",
  description: "Memorize the flash of color, recreate it from memory, and chase precision points in the Wednesday slot.",
};

export default function DrawingMatchPage() {
  return <DrawingMatchGame />;
}

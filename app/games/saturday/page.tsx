import type { Metadata } from "next";
import AngrymojiGame from "./angrymoji-game";

export const metadata: Metadata = {
  title: "Angrymoji · MM Games",
  description: "Prototype rage-fueled emoji arena for the Saturday slot.",
};

export default function AngrymojiPage() {
  return <AngrymojiGame />;
}

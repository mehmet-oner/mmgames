import type { Metadata } from "next";
import SnakemojiGame from "./snakemoji-game";

export const metadata: Metadata = {
  title: "Snakemoji · MM Games",
  description: "A minimalist emoji-fueled snake challenge for the Monday slot.",
};

export default function SnakemojiPage() {
  return <SnakemojiGame />;
}

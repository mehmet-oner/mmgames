import type { Metadata } from "next";
import SimonColorsGame from "./simon-colors-game";

export const metadata: Metadata = {
  title: "Simon Colors · MM Games",
  description: "Prototype Simon-style color memory challenge for the Friday slot.",
};

export default function SimonColorsPage() {
  return <SimonColorsGame />;
}

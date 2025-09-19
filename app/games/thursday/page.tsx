import type { Metadata } from "next";
import TiltDropGame from "./tilt-drop-game";

export const metadata: Metadata = {
  title: "Tilt Drop · MM Games",
  description: "A tilt-happy remix of falling blocks built for the Thursday slot.",
};

export default function TiltDropPage() {
  return <TiltDropGame />;
}

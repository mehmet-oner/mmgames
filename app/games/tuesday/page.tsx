import type { Metadata } from "next";
import ColorsGame from "./colors-game";

export const metadata: Metadata = {
  title: "Colors · MM Games",
  description: "Hit the hues at hyper speed in Tuesday's spinning reflex test.",
};

export default function ColorsPage() {
  return <ColorsGame />;
}

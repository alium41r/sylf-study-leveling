import type { Metadata } from "next";
import JourneyLanding from "./components/landing/journey/JourneyLanding";

export const metadata: Metadata = {
  title: "Sylf — A little focus. A different you.",
  description:
    "Make room for who you’re becoming. Turn study time into XP, find your focus, and grow alongside friends with Sylf. Join the early-access waitlist.",
};

export default function Home() {
  return <JourneyLanding />;
}

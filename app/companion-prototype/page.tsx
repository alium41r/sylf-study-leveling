import type { Metadata } from "next";
import CompanionReview from "../components/landing/companion/CompanionReview";

export const metadata: Metadata = {
  title: "Sylf — Landing companion review",
  robots: { index: false, follow: false },
};

/** Review surface for the same canonical component used on the landing page. */
export default function CompanionPrototype() {
  return <CompanionReview />;
}

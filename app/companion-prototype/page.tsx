import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sylf — Landing companion review",
  robots: { index: false, follow: false },
};

/** Review surface for the same canonical component used on the landing page. */
export default function CompanionPrototype() {
  redirect('/locker?tab=identity&view=pixel-studio');
}

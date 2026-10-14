import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

/**
 * Development-only validation surface for the Pixel Display.
 *
 * PREVENTING PRODUCTION ACCESS (roadmap [R2])
 *  - This is a server component, so the `NODE_ENV` check runs on the server and
 *    throws the framework's 404 before any client code can mount.
 *  - `dynamic = "force-dynamic"` keeps that check on the request path. Without
 *    it the segment could be prerendered at build time, freezing the gate's
 *    outcome into a static artifact.
 *  - The interactive controls are *also* dev-gated internally, so a bypass still
 *    cannot reach an instrumented surface.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sylf — Pixel Display (development)",
  robots: { index: false, follow: false },
};

export default function PixelDisplayDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  redirect('/locker?tab=identity&view=pixel-studio');
}

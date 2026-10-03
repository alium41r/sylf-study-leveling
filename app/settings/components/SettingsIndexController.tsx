"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSettings } from "@/app/components/SettingsContext";

/**
 * SettingsIndexController — Canonical controller for the /settings root.
 * Interprets query parameters like ?tab=account or OAuth params,
 * opens the global System Hub overlay, and returns to origin/dashboard.
 */
export function SettingsIndexController() {
  const router = useRouter();
  const { openSettings } = useSettings();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = window.location.hash.includes("?")
        ? window.location.hash.split("?")[1]
        : window.location.search;
      const searchParams = new URLSearchParams(search);
      const tab = searchParams.get("tab");

      if (tab) {
        router.replace(`/settings/${tab}${search ? `?${searchParams.toString()}` : ""}`);
        return;
      }

      // If OAuth or other query params are present without a specific tab, default to account
      if (searchParams.toString().length > 0) {
        router.replace(`/settings/account?${searchParams.toString()}`);
        return;
      }
    }
    openSettings();
    router.replace("/dashboard");
  }, [router, openSettings]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ color: "var(--text-muted)" }}
    >
      <p style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        Opening System Hub...
      </p>
    </div>
  );
}

export default SettingsIndexController;

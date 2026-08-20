"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * /settings index page — redirects to the appropriate settings section
 * or /settings/account if parameters like ?tab=account or ?connected=... are present.
 */
export default function SettingsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = window.location.search;
      const searchParams = new URLSearchParams(search);
      const tab = searchParams.get("tab") || "account";

      if (tab) {
        router.replace(`/settings/${tab}${search ? search : ""}`);
        return;
      }
    }
    router.replace("/settings/account");
  }, [router]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ color: "var(--text-muted)" }}
    >
      <p style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        Redirecting to Settings...
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * /settings index page — redirects to dashboard since the settings panel
 * is an overlay accessed via the gear icon, not a standalone route.
 */
export default function SettingsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ color: "var(--text-muted)" }}
    >
      <p style={{ fontFamily: "'Rajdhani', sans-serif" }}>
        Redirecting...
      </p>
    </div>
  );
}

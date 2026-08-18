"use client";

import { useRouter } from "next/navigation";
import { useSettings } from "./SettingsContext";

/**
 * Back button for settings sub-pages.
 * Navigates back to the origin route (where the user was before entering settings)
 * and immediately re-opens the settings panel overlay.
 */
export default function BackToSettings() {
  const router = useRouter();
  const { openSettings, originRoute } = useSettings();

  const handleClick = () => {
    // Navigate to the origin route (the page the user was on before entering settings).
    // This avoids polluting the browser history stack with a chain of /settings/* entries.
    const target = originRoute || "/dashboard";
    router.push(target);
    // Re-open the settings panel after navigation completes
    setTimeout(() => openSettings(), 200);
  };

  return (
    <button
      onClick={handleClick}
      className="settings-page-back"
      style={{ cursor: "pointer", background: "none", border: "none" }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back to System Hub
    </button>
  );
}

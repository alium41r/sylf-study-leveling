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
    // 1. Immediately open the System Hub overlay so it renders with 0ms lag
    // and covers the screen before any background navigation can be perceived.
    openSettings();

    // 2. Silently update the background route to origin route so the underlying
    // page and browser history stay clean without showing any intermediate pages.
    const target = originRoute && !originRoute.startsWith("/settings") ? originRoute : "/dashboard";
    router.replace(target);
  };

  return (
    <button
      onClick={handleClick}
      className="settings-page-back"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back to System Hub
    </button>
  );
}

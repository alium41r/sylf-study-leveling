"use client";

import { useEffect } from "react";
import { useHeartbeat } from "../hooks/useHeartbeat";
import { SessionInviteToast } from "./SessionInviteToast";
import SessionEndToast from "./SessionEndToast";
import SettingsPanel from "./SettingsPanel";
import { SettingsProvider } from "./SettingsContext";
import { AcousticsProvider } from "./AcousticsContext";
import { AcousticsDynamicIsland } from "./AcousticsDynamicIsland";
import TopRightBar from "./TopRightBar";

/* ─── Theme & Background Definitions ─────────────────────────── */
// Kept in sync with the themes/backgrounds pages so GlobalWrapper
// can apply saved preferences on mount without importing page code.

const THEME_MAP: Record<string, Record<string, string>> = {
  cyberpunk: {
    "--accent-primary": "#7c3aed",
    "--accent-primary-light": "#a78bfa",
    "--accent-primary-dim": "rgba(124, 58, 237, 0.15)",
    "--accent-primary-mid": "rgba(124, 58, 237, 0.4)",
    "--accent-primary-dark": "#4c1d95",
    "--accent-purple": "#7c3aed",
    "--accent-cyan": "#a78bfa",
    "--accent-blue": "#7c3aed",
  },
  sakura: {
    "--accent-primary": "#ec4899",
    "--accent-primary-light": "#f9a8d4",
    "--accent-primary-dim": "rgba(236, 72, 153, 0.15)",
    "--accent-primary-mid": "rgba(236, 72, 153, 0.4)",
    "--accent-primary-dark": "#9d174d",
    "--accent-purple": "#ec4899",
    "--accent-cyan": "#f9a8d4",
    "--accent-blue": "#ec4899",
  },
  emerald: {
    "--accent-primary": "#10b981",
    "--accent-primary-light": "#6ee7b7",
    "--accent-primary-dim": "rgba(16, 185, 129, 0.15)",
    "--accent-primary-mid": "rgba(16, 185, 129, 0.4)",
    "--accent-primary-dark": "#065f46",
    "--accent-purple": "#10b981",
    "--accent-cyan": "#6ee7b7",
    "--accent-blue": "#10b981",
  },
  crimson: {
    "--accent-primary": "#ef4444",
    "--accent-primary-light": "#fca5a5",
    "--accent-primary-dim": "rgba(239, 68, 68, 0.15)",
    "--accent-primary-mid": "rgba(239, 68, 68, 0.4)",
    "--accent-primary-dark": "#991b1b",
    "--accent-purple": "#ef4444",
    "--accent-cyan": "#fca5a5",
    "--accent-blue": "#ef4444",
  },
  amber: {
    "--accent-primary": "#f59e0b",
    "--accent-primary-light": "#fcd34d",
    "--accent-primary-dim": "rgba(245, 158, 11, 0.15)",
    "--accent-primary-mid": "rgba(245, 158, 11, 0.4)",
    "--accent-primary-dark": "#92400e",
    "--accent-purple": "#f59e0b",
    "--accent-cyan": "#fcd34d",
    "--accent-blue": "#f59e0b",
  },
  abyss: {
    "--accent-primary": "#6366f1",
    "--accent-primary-light": "#a5b4fc",
    "--accent-primary-dim": "rgba(99, 102, 241, 0.15)",
    "--accent-primary-mid": "rgba(99, 102, 241, 0.4)",
    "--accent-primary-dark": "#3730a3",
    "--accent-purple": "#6366f1",
    "--accent-cyan": "#a5b4fc",
    "--accent-blue": "#6366f1",
  },
};

const BG_MAP: Record<string, { value: string; size?: string; lightValue: string }> = {
  void: { 
    value: "linear-gradient(to bottom, #090d16, #0d1117)",
    lightValue: "linear-gradient(to bottom, #f8fafc, #f1f5f9)"
  },
  "cyber-grid": {
    value:
      "linear-gradient(transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(90deg, transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(to bottom, #0d1117, #0d1117)",
    size: "30px 30px, 30px 30px, auto",
    lightValue: 
      "linear-gradient(transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(90deg, transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(to bottom, #f8fafc, #f8fafc)"
  },
  "sakura-fall": {
    value:
      "radial-gradient(circle at top right, rgba(244, 114, 182, 0.25), transparent 45%), linear-gradient(to bottom, #0f0a0c, #0a0507)",
    lightValue: 
      "radial-gradient(circle at top right, rgba(244, 114, 182, 0.25), transparent 50%), linear-gradient(to bottom, #fff5f7, #fdf2f8)"
  },
  "abyssal-glow": {
    value:
      "radial-gradient(circle at center, rgba(124, 58, 237, 0.25) 0%, transparent 65%), linear-gradient(to bottom, #0a0a14, #05050a)",
    lightValue: 
      "radial-gradient(circle at center, rgba(124, 58, 237, 0.18) 0%, transparent 65%), linear-gradient(to bottom, #f5f3ff, #ede9fe)"
  },
  "neon-sunrise": {
    value:
      "linear-gradient(to top, rgba(239, 68, 68, 0.18), rgba(245, 158, 11, 0.1), transparent), linear-gradient(to bottom, #0f0a0a, #050505)",
    lightValue: 
      "linear-gradient(to top, rgba(239, 68, 68, 0.12), rgba(245, 158, 11, 0.08), transparent), linear-gradient(to bottom, #f8fafc, #f1f5f9)"
  },
  "matrix-rain": {
    value:
      "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.05) 0px, transparent 1px, transparent 20px), linear-gradient(to bottom, #050f0a, #020503)",
    lightValue: 
      "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.05) 0px, transparent 1px, transparent 20px), linear-gradient(to bottom, #ecfdf5, #d1fae5)"
  },
  "aurora-borealis": {
    value:
      "radial-gradient(ellipse at top, rgba(6, 182, 212, 0.18) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(124, 58, 237, 0.15) 0%, transparent 50%), linear-gradient(to bottom, #060610, #050508)",
    lightValue: 
      "radial-gradient(ellipse at top, rgba(6, 182, 212, 0.15) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(124, 58, 237, 0.12) 0%, transparent 50%), linear-gradient(to bottom, #f0fdfa, #e0f2fe)"
  },
  "deep-ocean": {
    value:
      "radial-gradient(circle at bottom, rgba(59, 130, 246, 0.18) 0%, transparent 60%), linear-gradient(to bottom, #040810, #020406)",
    lightValue: 
      "radial-gradient(circle at bottom, rgba(59, 130, 246, 0.15) 0%, transparent 60%), linear-gradient(to bottom, #eff6ff, #dbeafe)"
  },
};

import { ProfileModalProvider } from "./ProfileModalContext";
import { PublicProfileModal } from "./PublicProfileModal";
import { useAuth } from "./AuthProvider";
import { SystemAIProvider } from "./system/SystemAIProvider";

export function applyGlobalBackground(bgId?: string | null, mode?: string | null) {
  if (typeof window === "undefined") return;
  const currentMode = mode || document.documentElement.getAttribute("data-mode") || localStorage.getItem("app_mode") || "dark";
  const currentBg = bgId || localStorage.getItem("app_background") || "void";
  const bgData = BG_MAP[currentBg] || BG_MAP["void"];
  if (bgData) {
    document.body.style.background = currentMode === "light" ? bgData.lightValue : bgData.value;
    document.body.style.backgroundSize = bgData.size || "cover";
    document.body.style.backgroundAttachment = "fixed";
  }
}

export function applyGlobalTheme(themeId?: string | null) {
  if (typeof window === "undefined") return;
  const currentTheme = themeId || localStorage.getItem("app_theme") || "cyberpunk";
  const vars = THEME_MAP[currentTheme];
  if (vars) {
    for (const [prop, val] of Object.entries(vars)) {
      document.documentElement.style.setProperty(prop, val);
    }
  }
}

export function GlobalSystemWrapper({ children }: { children: React.ReactNode }) {
  useHeartbeat();
  const { user } = useAuth();

  // Apply saved theme + background on mount & sync when user or storage updates
  useEffect(() => {
    // Mode
    const savedMode = localStorage.getItem("app_mode") || "dark";
    document.documentElement.setAttribute("data-mode", savedMode);

    // Theme
    const activeTheme = user?.activeTheme || localStorage.getItem("app_theme") || "cyberpunk";
    if (user?.activeTheme && user.activeTheme !== localStorage.getItem("app_theme")) {
      localStorage.setItem("app_theme", user.activeTheme);
    }
    applyGlobalTheme(activeTheme);

    // Background
    const activeBg = user?.activeBackground || localStorage.getItem("app_background") || "void";
    if (user?.activeBackground && user.activeBackground !== localStorage.getItem("app_background")) {
      localStorage.setItem("app_background", user.activeBackground);
    }
    applyGlobalBackground(activeBg, savedMode);

    const handleBgUpdate = () => {
      const latestBg = localStorage.getItem("app_background") || "void";
      const latestMode = localStorage.getItem("app_mode") || "dark";
      applyGlobalBackground(latestBg, latestMode);
    };

    const handleThemeUpdate = () => {
      const latestTheme = localStorage.getItem("app_theme") || "cyberpunk";
      applyGlobalTheme(latestTheme);
    };

    window.addEventListener("background-updated", handleBgUpdate);
    window.addEventListener("theme-updated", handleThemeUpdate);
    window.addEventListener("storage", handleBgUpdate);
    window.addEventListener("storage", handleThemeUpdate);

    return () => {
      window.removeEventListener("background-updated", handleBgUpdate);
      window.removeEventListener("theme-updated", handleThemeUpdate);
      window.removeEventListener("storage", handleBgUpdate);
      window.removeEventListener("storage", handleThemeUpdate);
    };
  }, [user?.activeBackground, user?.activeTheme]);

  return (
    <AcousticsProvider>
      <SettingsProvider>
        <ProfileModalProvider>
          <SystemAIProvider>
            {children}
          </SystemAIProvider>
          <PublicProfileModal />
          <AcousticsDynamicIsland />
          <SessionInviteToast />
          <SessionEndToast />
          <TopRightBar />
          <SettingsPanel />
        </ProfileModalProvider>
      </SettingsProvider>
    </AcousticsProvider>
  );
}

// Export the maps so the appearance pages can reuse them
export { THEME_MAP, BG_MAP };

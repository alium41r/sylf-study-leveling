"use client";

import { useEffect } from "react";
import { useHeartbeat } from "../hooks/useHeartbeat";
import { SessionInviteToast } from "./SessionInviteToast";
import SettingsPanel from "./SettingsPanel";
import { SettingsProvider } from "./SettingsContext";
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
  },
  sakura: {
    "--accent-primary": "#ec4899",
    "--accent-primary-light": "#f9a8d4",
    "--accent-primary-dim": "rgba(236, 72, 153, 0.15)",
    "--accent-primary-mid": "rgba(236, 72, 153, 0.4)",
  },
  emerald: {
    "--accent-primary": "#10b981",
    "--accent-primary-light": "#6ee7b7",
    "--accent-primary-dim": "rgba(16, 185, 129, 0.15)",
    "--accent-primary-mid": "rgba(16, 185, 129, 0.4)",
  },
  crimson: {
    "--accent-primary": "#ef4444",
    "--accent-primary-light": "#fca5a5",
    "--accent-primary-dim": "rgba(239, 68, 68, 0.15)",
    "--accent-primary-mid": "rgba(239, 68, 68, 0.4)",
  },
  amber: {
    "--accent-primary": "#f59e0b",
    "--accent-primary-light": "#fcd34d",
    "--accent-primary-dim": "rgba(245, 158, 11, 0.15)",
    "--accent-primary-mid": "rgba(245, 158, 11, 0.4)",
  },
  abyss: {
    "--accent-primary": "#6366f1",
    "--accent-primary-light": "#a5b4fc",
    "--accent-primary-dim": "rgba(99, 102, 241, 0.15)",
    "--accent-primary-mid": "rgba(99, 102, 241, 0.4)",
  },
};

const BG_MAP: Record<string, { value: string; size?: string }> = {
  void: { value: "linear-gradient(to bottom, #05050f, #050508)" },
  "cyber-grid": {
    value:
      "linear-gradient(transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(90deg, transparent 95%, rgba(6, 182, 212, 0.15) 100%), linear-gradient(to bottom, #0a0a0f, #0a0a0f)",
    size: "30px 30px, 30px 30px, auto",
  },
  "sakura-fall": {
    value:
      "radial-gradient(circle at top right, rgba(244, 114, 182, 0.15), transparent 40%), linear-gradient(to bottom, #0f0a0c, #0a0507)",
  },
  "abyssal-glow": {
    value:
      "radial-gradient(circle at center, rgba(124, 58, 237, 0.15) 0%, transparent 60%), linear-gradient(to bottom, #0a0a14, #05050a)",
  },
  "neon-sunrise": {
    value:
      "linear-gradient(to top, rgba(239, 68, 68, 0.1), rgba(245, 158, 11, 0.05), transparent), linear-gradient(to bottom, #0f0a0a, #050505)",
  },
  "matrix-rain": {
    value:
      "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.03) 0px, transparent 1px, transparent 20px), linear-gradient(to bottom, #050f0a, #020503)",
  },
  "aurora-borealis": {
    value:
      "radial-gradient(ellipse at top, rgba(6, 182, 212, 0.12) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(124, 58, 237, 0.1) 0%, transparent 50%), linear-gradient(to bottom, #060610, #050508)",
  },
  "deep-ocean": {
    value:
      "radial-gradient(circle at bottom, rgba(59, 130, 246, 0.12) 0%, transparent 60%), linear-gradient(to bottom, #040810, #020406)",
  },
};

export function GlobalSystemWrapper({ children }: { children: React.ReactNode }) {
  useHeartbeat();

  // Apply saved theme + background on mount
  useEffect(() => {
    // Theme
    const savedTheme = localStorage.getItem("app_theme");
    if (savedTheme && THEME_MAP[savedTheme]) {
      const vars = THEME_MAP[savedTheme];
      for (const [prop, val] of Object.entries(vars)) {
        document.documentElement.style.setProperty(prop, val);
      }
    }

    // Background
    const savedBg = localStorage.getItem("app_background");
    if (savedBg && BG_MAP[savedBg]) {
      document.body.style.background = BG_MAP[savedBg].value;
      document.body.style.backgroundSize = BG_MAP[savedBg].size || "cover";
      document.body.style.backgroundAttachment = "fixed";
    }
  }, []);

  return (
    <SettingsProvider>
      {children}
      <SessionInviteToast />
      <TopRightBar />
      <SettingsPanel />
    </SettingsProvider>
  );
}

// Export the maps so the appearance pages can reuse them
export { THEME_MAP, BG_MAP };

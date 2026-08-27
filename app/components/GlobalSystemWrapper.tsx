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
  volt: {
    "--accent-primary": "#84cc16",
    "--accent-primary-light": "#bef264",
    "--accent-primary-dim": "rgba(132, 204, 22, 0.15)",
    "--accent-primary-mid": "rgba(132, 204, 22, 0.4)",
    "--accent-primary-dark": "#4d7c0f",
    "--accent-purple": "#84cc16",
    "--accent-cyan": "#bef264",
    "--accent-blue": "#84cc16",
  },
  plasma: {
    "--accent-primary": "#d946ef",
    "--accent-primary-light": "#f0abfc",
    "--accent-primary-dim": "rgba(217, 70, 239, 0.15)",
    "--accent-primary-mid": "rgba(217, 70, 239, 0.4)",
    "--accent-primary-dark": "#a21caf",
    "--accent-purple": "#d946ef",
    "--accent-cyan": "#f0abfc",
    "--accent-blue": "#d946ef",
  },
  glacier: {
    "--accent-primary": "#06b6d4",
    "--accent-primary-light": "#67e8f9",
    "--accent-primary-dim": "rgba(6, 182, 212, 0.15)",
    "--accent-primary-mid": "rgba(6, 182, 212, 0.4)",
    "--accent-primary-dark": "#0e7490",
    "--accent-purple": "#06b6d4",
    "--accent-cyan": "#67e8f9",
    "--accent-blue": "#06b6d4",
  },
  solar: {
    "--accent-primary": "#f97316",
    "--accent-primary-light": "#fdba74",
    "--accent-primary-dim": "rgba(249, 115, 22, 0.15)",
    "--accent-primary-mid": "rgba(249, 115, 22, 0.4)",
    "--accent-primary-dark": "#c2410c",
    "--accent-purple": "#f97316",
    "--accent-cyan": "#fdba74",
    "--accent-blue": "#f97316",
  },
};

const BG_MAP: Record<string, { value: string; size?: string; repeat?: string; lightValue: string }> = {
  void: {
    value:
      "radial-gradient(ellipse at top, rgba(129, 140, 248, 0.20) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(56, 189, 248, 0.10) 0%, transparent 60%), linear-gradient(180deg, #0d0f1e 0%, #070811 55%, #04050c 100%)",
    lightValue:
      "radial-gradient(ellipse at top, rgba(129, 140, 248, 0.28) 0%, transparent 55%), radial-gradient(ellipse at bottom, rgba(56, 189, 248, 0.18) 0%, transparent 60%), linear-gradient(180deg, #eef2ff 0%, #e4e9f5 55%, #dde3ef 100%)",
  },
  "cyber-grid": {
    value:
      "linear-gradient(transparent 94%, rgba(6, 182, 212, 0.32) 100%), linear-gradient(90deg, transparent 94%, rgba(6, 182, 212, 0.32) 100%), radial-gradient(ellipse at bottom, rgba(99, 102, 241, 0.38) 0%, transparent 55%), linear-gradient(to bottom, #0b1220, #060a16)",
    size: "30px 30px, 30px 30px, 100% 100%, 100% 100%",
    repeat: "repeat, repeat, no-repeat, no-repeat",
    lightValue:
      "linear-gradient(transparent 94%, rgba(6, 182, 212, 0.40) 100%), linear-gradient(90deg, transparent 94%, rgba(6, 182, 212, 0.40) 100%), radial-gradient(ellipse at bottom, rgba(129, 140, 248, 0.30) 0%, transparent 55%), linear-gradient(to bottom, #eef6fd, #e2ecfa)",
  },
  "sakura-fall": {
    value:
      "radial-gradient(circle at top right, rgba(244, 114, 182, 0.50) 0%, transparent 48%), radial-gradient(circle at bottom left, rgba(236, 72, 153, 0.30) 0%, transparent 52%), radial-gradient(circle at 25% 65%, rgba(251, 207, 232, 0.10) 0%, transparent 45%), linear-gradient(to bottom, #1d0b16, #0e0510)",
    lightValue:
      "radial-gradient(circle at top right, rgba(249, 168, 212, 0.65) 0%, transparent 50%), radial-gradient(circle at bottom left, rgba(244, 114, 182, 0.40) 0%, transparent 55%), linear-gradient(to bottom, #fff0f6, #fbdfec)",
  },
  "abyssal-glow": {
    value:
      "radial-gradient(circle at center, rgba(168, 85, 247, 0.50) 0%, rgba(124, 58, 237, 0.30) 24%, transparent 62%), radial-gradient(circle at 5% 10%, rgba(59, 130, 246, 0.22) 0%, transparent 48%), radial-gradient(circle at 95% 90%, rgba(217, 70, 239, 0.22) 0%, transparent 50%), linear-gradient(to bottom, #14102a, #080613)",
    lightValue:
      "radial-gradient(circle at center, rgba(167, 139, 250, 0.55) 0%, rgba(196, 181, 253, 0.35) 30%, transparent 66%), radial-gradient(circle at 5% 10%, rgba(147, 197, 253, 0.30) 0%, transparent 50%), radial-gradient(circle at 95% 90%, rgba(240, 171, 252, 0.32) 0%, transparent 52%), linear-gradient(to bottom, #f3efff, #e7e3fb)",
  },
  "neon-sunrise": {
    value:
      "linear-gradient(to top, rgba(239, 68, 68, 0.55) 0%, rgba(245, 158, 11, 0.35) 26%, rgba(168, 85, 247, 0.18) 48%, transparent 70%), radial-gradient(circle at bottom, rgba(239, 68, 68, 0.28) 0%, transparent 45%), linear-gradient(to bottom, #170c10, #070508)",
    lightValue:
      "linear-gradient(to top, rgba(251, 113, 133, 0.55) 0%, rgba(251, 191, 36, 0.32) 30%, rgba(216, 180, 254, 0.20) 55%, transparent 75%), linear-gradient(to bottom, #fff5f3, #fde4d0)",
  },
  "matrix-rain": {
    value:
      "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.16) 0px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, rgba(16, 185, 129, 0.06) 0px, transparent 1px, transparent 90px), radial-gradient(circle at bottom, rgba(16, 185, 129, 0.30) 0%, transparent 60%), linear-gradient(to bottom, #06130c, #02100a)",
    lightValue:
      "repeating-linear-gradient(0deg, rgba(16, 185, 129, 0.22) 0px, transparent 1px, transparent 18px), repeating-linear-gradient(90deg, rgba(16, 185, 129, 0.10) 0px, transparent 1px, transparent 90px), radial-gradient(circle at bottom, rgba(52, 211, 153, 0.35) 0%, transparent 60%), linear-gradient(to bottom, #d8fce9, #b7f2d2)",
  },
  "aurora-borealis": {
    value:
      "radial-gradient(ellipse 120% 65% at 15% -10%, rgba(34, 211, 238, 0.40) 0%, transparent 55%), radial-gradient(ellipse 130% 70% at 85% 15%, rgba(139, 92, 246, 0.38) 0%, transparent 58%), radial-gradient(ellipse 140% 70% at 50% 110%, rgba(52, 211, 153, 0.28) 0%, transparent 58%), linear-gradient(to bottom, #070b18, #05050f)",
    lightValue:
      "radial-gradient(ellipse 120% 65% at 15% -10%, rgba(103, 232, 249, 0.55) 0%, transparent 55%), radial-gradient(ellipse 130% 70% at 85% 15%, rgba(196, 181, 253, 0.55) 0%, transparent 58%), radial-gradient(ellipse 140% 70% at 50% 110%, rgba(167, 243, 208, 0.45) 0%, transparent 58%), linear-gradient(to bottom, #eafcff, #dfe9ff)",
  },
  "deep-ocean": {
    value:
      "radial-gradient(circle at 50% 78%, rgba(59, 130, 246, 0.50) 0%, rgba(14, 165, 233, 0.18) 30%, transparent 62%), radial-gradient(circle at 8% 8%, rgba(34, 211, 238, 0.16) 0%, transparent 45%), linear-gradient(to bottom, #051222, #020710)",
    lightValue:
      "radial-gradient(circle at 50% 78%, rgba(96, 165, 250, 0.55) 0%, rgba(125, 211, 252, 0.22) 30%, transparent 62%), radial-gradient(circle at 8% 8%, rgba(103, 232, 249, 0.30) 0%, transparent 45%), linear-gradient(to bottom, #dcefff, #c8e4fb)",
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
  if (!bgData) return;

  // The wallpaper lives on a dedicated in-flow layer (#app-bg-layer) that is
  // absolutely positioned inside a `position: relative` wrapper around the
  // page content, so it spans the FULL document height and scrolls with the
  // content on every device.
  //
  // Why not a viewport-fixed element or a <body> background?
  //   • `background-attachment: fixed` — ignored on iOS Safari, mis-painted
  //     on Android Chrome (the original mobile "cut off" bug).
  //   • `position: fixed` layer — Android Chrome rasterizes fixed layers
  //     lazily during scroll gestures, so the wallpaper lags behind and
  //     catches up ~0.1s after scrolling stops.
  //   • <body> background — promoted to the canvas (because <html> carries
  //     no background), and mobile Chrome re-tiles that canvas background in
  //     viewport-sized chunks. The gradient repeats instead of running the
  //     full document, producing a visible seam past the first viewport.
  //   An in-flow element is painted eagerly and exactly once, covering the
  //   full document — none of the above rendering quirks apply.
  const layer = document.getElementById("app-bg-layer") as HTMLElement | null;
  if (layer) {
    layer.style.background = currentMode === "light" ? bgData.lightValue : bgData.value;
    layer.style.backgroundSize = bgData.size || "cover";
    layer.style.backgroundRepeat = bgData.repeat || "no-repeat";
  }
  // Never leave a stale background paint on <body>: the layer is the single
  // source of truth, and a body paint would cover it (body backgrounds paint
  // above negative z-index children).
  document.body.style.background = "transparent";
  document.body.style.backgroundColor = "transparent";
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

    // Re-apply on viewport resize/rotate is unnecessary: the wallpaper layer
    // is an in-flow element that spans the document, which is stable across
    // breakpoints by construction.

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
            {/* Wallpaper layer: in-flow, absolutely positioned against this
                relative wrapper so it spans the full document height and
                scrolls with the content — see applyGlobalBackground. */}
            <div className="relative isolate">
              <div
                id="app-bg-layer"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: -10,
                  pointerEvents: "none",
                  transition: "background 0.3s ease",
                }}
              />
              {children}
            </div>
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

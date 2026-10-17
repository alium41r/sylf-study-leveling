"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useSettings } from "./SettingsContext";
import { ImmersiveModeButton } from "./ImmersiveModeButton";

import { StreakFlameIcon } from "@/app/components/icons";

const INLINE_HEADER_PREFIXES = [
  "/system",
  "/social",
  "/shop",
  "/inventory",
  "/focus",
  "/focus-party",
  "/login",
  "/register",
  "/onboarding",
  "/companion-prototype",
];

export default function TopRightBar() {
  const { user } = useAuth();
  const { isOpen: isSettingsModalOpen } = useSettings();
  const [justExtendedStreak, setJustExtendedStreak] = useState(false);
  const [testAnimation, setTestAnimation] = useState(false);
  const [prevStreak, setPrevStreak] = useState<number | null>(null);
  const [isPixelStudioView, setIsPixelStudioView] = useState(false);
  const pathname = usePathname();

  // Check for streak extension animation
  useEffect(() => {
    if (user && prevStreak !== null && user.streakDays > prevStreak) {
      setJustExtendedStreak(true);
      setTimeout(() => setJustExtendedStreak(false), 3000);
    }
    if (user) {
      setPrevStreak(user.streakDays);
    }
  }, [user?.streakDays]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const syncStudioAttr = () => {
      setIsPixelStudioView(
        document.documentElement.getAttribute("data-pixel-studio") === "true"
      );
    };
    syncStudioAttr();
    const observer = new MutationObserver(syncStudioAttr);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-pixel-studio"],
    });
    return () => observer.disconnect();
  }, [pathname]);

  if (!user || !pathname || pathname === "/" || isSettingsModalOpen || isPixelStudioView) {
    return null;
  }

  const hasInlineHeaderControl = INLINE_HEADER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (hasInlineHeaderControl) {
    return null;
  }

  const isDashboardOrHome = pathname === "/dashboard" || pathname === "/home";
  const isSettingsRoute =
    pathname === "/settings" || pathname.startsWith("/settings/");

  const handleTestAnimation = () => {
    setTestAnimation(true);
    setTimeout(() => setTestAnimation(false), 2000);
  };

  const isAnimating = justExtendedStreak || testAnimation;

  return (
    <div
      className={`${
        isSettingsRoute ? "flex" : "hidden md:flex"
      } fixed z-40 flex-row items-center gap-3 transition-opacity duration-300 opacity-100`}
      style={{
        top: "calc(1.25rem + env(safe-area-inset-top, 0px))",
        right: "max(1.25rem, env(safe-area-inset-right, 0px))",
      }}
    >
      {isDashboardOrHome && (
        <>
          {/* ─── Sylph Badge ───────────────────────────────────── */}
          <div
            title="Sylph (System Currency)"
            className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle bg-bg-panel/40 backdrop-blur-md shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 hover:border-accent-primary hover:shadow-[0_0_15px_var(--accent-primary-dim)] cursor-default"
          >
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
              <img
                src="/sylph-logo.jpg"
                alt="Sylph"
                className="w-full h-full object-cover scale-[1.35]"
              />
            </div>
            <span className="text-lg font-bold font-['Rajdhani'] tracking-wide text-accent-text-light">
              {user.sylph || 0}
            </span>
          </div>

          {/* ─── Weekly Streak Badge ────────────────────────────── */}
          <div
            onClick={handleTestAnimation}
            title={`Weekly Streak: ${user.streakDays || 0} consecutive week${
              user.streakDays === 1 ? "" : "s"
            } hitting the 3h milestone`}
            className={`pointer-events-auto cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-full border bg-bg-panel/40 backdrop-blur-md shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
              isAnimating
                ? "animate-streak-bounce border-yellow-400/80 shadow-yellow-500/50"
                : "border-border-subtle hover:border-yellow-400/50 hover:shadow-lg"
            }`}
          >
            <StreakFlameIcon
              size={16}
              className={`shrink-0 ${
                user.streakDays > 0 || isAnimating ? "text-yellow-400" : "text-text-muted"
              } ${isAnimating ? "drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" : ""}`}
            />
            <span
              className={`font-bold font-['Rajdhani'] tracking-wide text-sm ${
                user.streakDays > 0 ? "text-yellow-400" : "text-text-secondary"
              }`}
            >
              {user.streakDays}{" "}
              <span className="text-[10px] uppercase font-semibold text-text-muted">wks</span>
            </span>
          </div>
        </>
      )}

      {/* ─── Global Immersive Fullscreen Toggle ──────────────── */}
      <div className="pointer-events-auto">
        <ImmersiveModeButton variant="top-bar" />
      </div>
    </div>
  );
}


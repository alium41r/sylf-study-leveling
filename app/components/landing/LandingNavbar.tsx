"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun, Moon, Sparkles, LogIn } from "lucide-react";
import { applyAppMode, applyGlobalBackground } from "@/app/components/GlobalSystemWrapper";

interface LandingNavbarProps {
  /** When a fixed logged-in banner sits above the navbar, shift it down. */
  hasBanner?: boolean;
}

export default function LandingNavbar({ hasBanner = false }: LandingNavbarProps) {
  const [isLightMode, setIsLightMode] = useState(false);

  useEffect(() => {
    const syncMode = () => {
      const mode =
        document.documentElement.getAttribute("data-surface-polarity") ||
        document.documentElement.getAttribute("data-mode") ||
        localStorage.getItem("app_mode") ||
        "dark";
      setIsLightMode(mode === "light");
    };
    syncMode();
    const observer = new MutationObserver(syncMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "data-surface-polarity"],
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const newMode = isLightMode ? "dark" : "light";
    setIsLightMode(!isLightMode);
    localStorage.setItem("app_mode", newMode);
    applyAppMode(newMode);
    applyGlobalBackground(undefined, newMode);
    window.dispatchEvent(new Event("mode-updated"));
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <header
      className={`w-full transition-all duration-300 ${
        hasBanner ? "pt-10" : "pt-6 sm:pt-8"
      } pb-4`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <Link href="/" className="flex items-center gap-2.5 group select-none">
          <div className="w-8 h-8 rounded-lg bg-accent-primary-dim border border-accent-primary-mid/60 flex items-center justify-center text-accent-text-light group-hover:scale-105 transition-transform duration-200 shadow-sm">
            <Sparkles className="w-4 h-4 text-accent-primary-light" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-xl font-bold tracking-wide text-text-primary"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Sylf
            </span>
            <span
              className="text-[11px] font-semibold tracking-wider text-text-muted uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Study Leveling
            </span>
          </div>
        </Link>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme mode"
            className="w-8 h-8 rounded-lg border border-border-subtle bg-bg-abyss/80 flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-active transition-all cursor-pointer"
          >
            {isLightMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-300" />}
          </button>

          {/* Login Button */}
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle hover:border-border-active bg-bg-abyss/80 text-text-secondary hover:text-text-primary transition-all cursor-pointer"
          >
            <LogIn className="w-3.5 h-3.5 text-accent-primary-light" />
            <span>Log In</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

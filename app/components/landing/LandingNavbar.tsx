"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sun, Moon, Sparkles, ChevronRight, Menu, X } from "lucide-react";

interface LandingNavbarProps {
  /** When a fixed logged-in banner sits above the navbar, shift it down. */
  hasBanner?: boolean;
}

const NAV_LINKS = [
  { id: "what-is-sylf", label: "What is Sylf" },
  { id: "features", label: "Core System" },
  { id: "how-it-works", label: "How it Works" },
  { id: "faq", label: "FAQ" },
] as const;

export default function LandingNavbar({ hasBanner = false }: LandingNavbarProps) {
  const [isLightMode, setIsLightMode] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    // Check initial mode
    const mode = document.documentElement.getAttribute("data-mode") || localStorage.getItem("app_mode") || "dark";
    setIsLightMode(mode === "light");

    const handleScroll = () => {
      setHasScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleTheme = () => {
    const newMode = isLightMode ? "dark" : "light";
    setIsLightMode(!isLightMode);
    document.documentElement.setAttribute("data-mode", newMode);
    localStorage.setItem("app_mode", newMode);
    window.dispatchEvent(new Event("storage"));
  };

  const scrollToSection = (id: string) => {
    setIsMobileOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
        hasBanner ? "top-8" : "top-0"
      } ${
        hasScrolled
          ? "bg-bg-void/90 backdrop-blur-md border-b border-border-subtle shadow-lg py-2.5 sm:py-3"
          : "bg-transparent py-3.5 sm:py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <Link href="/" className="flex items-center gap-3 group select-none">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light group-hover:scale-105 transition-transform duration-300 shadow-sm">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-accent-primary-light animate-pulse" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span
                className="text-xl sm:text-2xl font-bold tracking-wider text-text-primary"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                Sylf
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--accent-primary)]" />
            </div>
            <span
              className="text-[10px] uppercase font-bold tracking-[0.25em] text-text-muted -mt-1"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Study Leveling
            </span>
          </div>
        </Link>

        {/* Center: Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Status Badge */}
          <div className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-accent-primary-mid/40 bg-accent-primary-dim/30 text-accent-text-light text-[11px] font-semibold tracking-wider uppercase font-['Rajdhani']">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>Pre-Release Staging</span>
          </div>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme mode"
            className="w-9 h-9 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-center text-text-secondary hover:text-text-primary hover:border-border-active transition-all cursor-pointer shadow-sm"
          >
            {isLightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-300" />}
          </button>

          {/* Primary Waitlist CTA */}
          <button
            onClick={() => scrollToSection("waitlist")}
            className="hidden sm:inline-flex btn-primary text-xs sm:text-sm px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg items-center gap-1.5 font-bold tracking-wider uppercase shadow-md cursor-pointer"
          >
            <span>Join Waitlist</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Hamburger */}
          <button
            onClick={() => setIsMobileOpen((open) => !open)}
            aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileOpen}
            className="md:hidden w-9 h-9 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-center text-text-primary hover:border-border-active transition-all cursor-pointer"
          >
            {isMobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {isMobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-bg-void/95 backdrop-blur-md border-b border-border-subtle shadow-2xl px-6 py-5 space-y-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-accent-primary-dim/40 transition-colors cursor-pointer"
            >
              {link.label}
            </button>
          ))}
          <div className="pt-3 mt-3 border-t border-border-subtle/60 flex items-center gap-3">
            <button
              onClick={() => scrollToSection("waitlist")}
              className="w-full btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold tracking-wider uppercase cursor-pointer"
            >
              Join Waitlist
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

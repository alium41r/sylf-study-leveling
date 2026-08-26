"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "./components/AuthProvider";
import LandingNavbar from "./components/landing/LandingNavbar";
import HeroSection from "./components/landing/HeroSection";
import WhatIsSylf from "./components/landing/WhatIsSylf";
import CoreFeatures from "./components/landing/CoreFeatures";
import HowItWorks from "./components/landing/HowItWorks";
import WaitlistSection, {
  type WaitlistPass,
} from "./components/landing/WaitlistSection";
import FaqSection from "./components/landing/FaqSection";
import LandingFooter from "./components/landing/LandingFooter";
import { LayoutDashboard, ArrowRight } from "lucide-react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const [heroPass, setHeroPass] = useState<WaitlistPass | null>(null);

  const handleHeroSignupSuccess = (data: WaitlistPass) => {
    // Hand the freshly minted pass straight to the waitlist section so it
    // renders instantly (no stale GET round-trip, correct "initialized"
    // label) and then guide the scholar down to their pass card.
    setHeroPass(data);
    const waitlistEl = document.getElementById("waitlist");
    if (waitlistEl) {
      waitlistEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  const isLoggedInBannerVisible = !isLoading && !!user;

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-x-hidden"
      style={{ backgroundColor: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* ─── Background Ambient Mesh & Radial Glows ───────────── */}
      <div
        className="fixed inset-0 opacity-[0.03] dark:opacity-[0.06] pointer-events-none -z-20"
        style={{
          backgroundImage:
            "linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] opacity-25 dark:opacity-35 pointer-events-none -z-10"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, var(--accent-primary-dim) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* ─── Logged-In User Quick Banner ────────────────────────── */}
      {isLoggedInBannerVisible && (
        <div className="fixed top-0 left-0 right-0 z-[60] h-8 bg-accent-primary-dim border-b border-accent-primary-mid/40 px-4 text-center text-xs font-semibold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light flex items-center justify-center gap-3 backdrop-blur-md">
          <span className="truncate">
            Authenticated as <strong>{user!.name || user!.username || "Scholar"}</strong> (Lv. {user!.level || 1} • {user!.hunterRank || "E"}-Rank)
          </span>
          <Link
            href="/dashboard"
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-accent-primary text-white text-[11px] font-bold hover:opacity-90 transition-opacity"
          >
            <LayoutDashboard className="w-3 h-3" />
            <span>Open Dashboard</span>
            <ArrowRight className="w-2.5 h-2.5" />
          </Link>
        </div>
      )}

      {/* ─── Top Navigation Bar (offset below the logged-in banner) ── */}
      <LandingNavbar hasBanner={isLoggedInBannerVisible} />

      {/* ─── Main Landing Content Sections ────────────────────── */}
      <main className="flex-1 w-full flex flex-col">
        {/* 1. Hero Section */}
        <HeroSection onSuccessSignup={handleHeroSignupSuccess} />

        {/* 2. What is Sylf? (Value Proposition & Comparison) */}
        <WhatIsSylf />

        {/* 3. Core System Capabilities (6 Pillars) */}
        <CoreFeatures />

        {/* 4. How It Works (The 4-Step Protocol) */}
        <HowItWorks />

        {/* 5. Waitlist Conversion & Access Pass Generator */}
        <WaitlistSection initialPass={heroPass} />

        {/* 6. FAQ & Trust */}
        <FaqSection />
      </main>

      {/* ─── Official Portal Footer ───────────────────────────── */}
      <LandingFooter />
    </div>
  );
}

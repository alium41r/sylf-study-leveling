"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Sun, Moon } from "lucide-react";

export default function LandingFooter() {
  const [modalContent, setModalContent] = useState<"privacy" | "terms" | null>(null);

  // Close the privacy/terms modal with Escape.
  useEffect(() => {
    if (!modalContent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalContent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalContent]);

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-mode") || "dark";
    const next = current === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", next);
    localStorage.setItem("app_mode", next);
    window.dispatchEvent(new Event("storage"));
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="border-t border-border-subtle bg-bg-void/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Brand Info */}
          <div className="md:col-span-5 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light shadow-sm">
                <Sparkles className="w-4 h-4 text-accent-primary-light" />
              </div>
              <span
                className="text-2xl font-bold tracking-wider text-text-primary"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                Sylf
              </span>
            </div>

            <p className="text-xs sm:text-sm text-text-secondary max-w-sm mb-4 leading-relaxed">
              The AI-powered gamified study leveling system. Transform curriculum into daily quests, log deep work, and ascend your scholar rank.
            </p>

            {/* System Telemetry Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border-subtle bg-bg-abyss text-[11px] text-text-muted font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>STAGING SERVERS ONLINE</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-4 grid grid-cols-2 gap-6 text-xs sm:text-sm font-['Rajdhani']">
            <div>
              <h4 className="font-bold text-text-primary uppercase tracking-wider mb-3">
                Navigation
              </h4>
              <ul className="space-y-2 text-text-secondary">
                <li>
                  <button onClick={() => scrollTo("what-is-sylf")} className="hover:text-text-primary cursor-pointer">
                    What is Sylf
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollTo("features")} className="hover:text-text-primary cursor-pointer">
                    Core System
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollTo("how-it-works")} className="hover:text-text-primary cursor-pointer">
                    How It Works
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollTo("faq")} className="hover:text-text-primary cursor-pointer">
                    FAQ
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-text-primary uppercase tracking-wider mb-3">
                Portal
              </h4>
              <ul className="space-y-2 text-text-secondary">
                <li>
                  <button onClick={() => scrollTo("waitlist")} className="hover:text-text-primary cursor-pointer text-accent-primary-light font-bold">
                    Join Waitlist
                  </button>
                </li>
                <li>
                  <Link href="/login" className="hover:text-text-primary">
                    Scholar Login
                  </Link>
                </li>
                <li>
                  <button onClick={() => setModalContent("privacy")} className="hover:text-text-primary cursor-pointer">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => setModalContent("terms")} className="hover:text-text-primary cursor-pointer">
                    Terms of Access
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Action */}
          <div className="md:col-span-3 flex flex-col items-start md:items-end">
            <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-muted mb-2">
              Appearance
            </span>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border-subtle bg-bg-abyss text-xs font-['Rajdhani'] font-bold text-text-secondary hover:text-text-primary hover:border-border-active transition-colors cursor-pointer"
            >
              <Sun className="w-3.5 h-3.5 text-amber-300" />
              <span>Toggle Dark / Light</span>
            </button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 mt-8 border-t border-border-subtle/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-text-muted">
          <p>© {new Date().getFullYear()} Sylf. All rights reserved. Built for scholars worldwide.</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setModalContent("privacy")} className="hover:text-text-primary cursor-pointer">
              Privacy
            </button>
            <span>•</span>
            <button onClick={() => setModalContent("terms")} className="hover:text-text-primary cursor-pointer">
              Terms
            </button>
          </div>
        </div>
      </div>

      {/* Privacy / Terms Modal */}
      {modalContent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={modalContent === "privacy" ? "Privacy Policy" : "Terms of Access"}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm cursor-pointer"
          onClick={() => setModalContent(null)}
        >
          <div
            className="w-full max-w-lg p-6 sm:p-8 rounded-2xl border border-border-active bg-bg-abyss shadow-2xl relative cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-xl font-bold text-text-primary mb-3 uppercase tracking-wider"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              {modalContent === "privacy" ? "Privacy Policy" : "Terms of Access"}
            </h3>

            <div className="text-xs text-text-secondary leading-relaxed space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
              {modalContent === "privacy" ? (
                <>
                  <p>
                    Sylf collects minimal information (your email address, target study goals, and chosen class) solely for waitlist verification, queue management, and beta access invitations.
                  </p>
                  <p>
                    We never sell, rent, or trade your contact information to third parties. All stored credentials and session tokens are encrypted using standard security protocols.
                  </p>
                  <p>
                    You may request deletion of your waitlist record at any time by contacting support or unregistering upon public launch.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    By joining the Sylf waitlist, you agree to receive pre-launch service announcements and beta access invitations.
                  </p>
                  <p>
                    Early beta features are subject to continuous refinement. Progression metrics, XP calibrations, and UI features may be updated during testing waves.
                  </p>
                  <p>
                    Abusive behavior, automated bot submissions, or artificial referral inflation will result in removal from early access eligibility.
                  </p>
                </>
              )}
            </div>

            <button
              onClick={() => setModalContent(null)}
              className="btn-primary w-full py-2.5 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}

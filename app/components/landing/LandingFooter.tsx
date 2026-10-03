"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

export default function LandingFooter({
  showAppAccess,
}: {
  showAppAccess: boolean;
}) {
  const [modalContent, setModalContent] = useState<"privacy" | "terms" | null>(null);

  useEffect(() => {
    if (!modalContent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalContent(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalContent]);

  return (
    <footer className="w-full py-8 mt-auto">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
        <p>© {new Date().getFullYear()} Sylf. Study Leveling.</p>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setModalContent("privacy")}
            className="hover:text-text-primary transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
          <span>•</span>
          <button
            onClick={() => setModalContent("terms")}
            className="hover:text-text-primary transition-colors cursor-pointer"
          >
            Terms of Access
          </button>
          {showAppAccess && (
            <>
              <span>•</span>
              <Link
                href="/login"
                className="hover:text-text-primary transition-colors font-medium text-text-secondary"
              >
                Scholar Log In
              </Link>
            </>
          )}
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
            className="w-full max-w-lg p-6 sm:p-8 rounded-2xl border border-border-subtle bg-bg-abyss shadow-2xl relative cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-xl font-bold text-text-primary mb-3 uppercase tracking-wider font-['Rajdhani']"
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
              className="btn-primary w-full py-2.5 rounded-lg text-xs font-bold font-['Rajdhani'] uppercase tracking-wider cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </footer>
  );
}

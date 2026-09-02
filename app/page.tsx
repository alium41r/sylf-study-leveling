"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "./components/AuthProvider";
import LandingNavbar from "./components/landing/LandingNavbar";
import LandingFooter from "./components/landing/LandingFooter";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  RefreshCcw,
  LayoutDashboard,
  Shield,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

interface WaitlistPass {
  referralCode: string;
  position: number;
  referralCount: number;
  targetExam?: string | null;
  alreadyRegistered: boolean;
}

const STORAGE_KEY = "sylf_waitlist_pass";

function persistPass(pass: WaitlistPass) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pass));
  } catch {
    // storage unavailable
  }
}

function readStoredPass(): WaitlistPass | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.referralCode && typeof parsed.position === "number") {
      return {
        referralCode: parsed.referralCode,
        position: parsed.position,
        referralCount: parsed.referralCount ?? 0,
        targetExam: parsed.targetExam ?? null,
        alreadyRegistered: true,
      };
    }
  } catch {
    // corrupted entry
  }
  return null;
}

export default function Home() {
  const { user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [waitlistPass, setWaitlistPass] = useState<WaitlistPass | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("pass");
    if (code) {
      fetch(`/api/waitlist?code=${encodeURIComponent(code)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            const pass: WaitlistPass = {
              referralCode: data.referralCode,
              position: data.position,
              referralCount: data.referralCount ?? 0,
              targetExam: data.targetExam ?? null,
              alreadyRegistered: true,
            };
            setWaitlistPass(pass);
            persistPass(pass);
          }
        })
        .catch(() => {});
      return;
    }

    const saved = readStoredPass();
    if (saved) {
      setWaitlistPass(saved);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const referredBy = urlParams.get("ref") || undefined;

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          referredBy,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to join waitlist. Please try again.");
      }

      const pass: WaitlistPass = {
        referralCode: data.referralCode,
        position: data.position,
        referralCount: data.referralCount || 0,
        targetExam: data.targetExam || null,
        alreadyRegistered: data.alreadyRegistered,
      };
      setWaitlistPass(pass);
      persistPass(pass);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPass = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setWaitlistPass(null);
    setEmail("");
    setCopySuccess(false);
  }, []);

  const shareUrl =
    typeof window !== "undefined" && waitlistPass
      ? `${window.location.origin}/?ref=${waitlistPass.referralCode}`
      : "";

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(
      "I just joined the early access waitlist for Sylf — the gamified study leveling system. Check it out here:"
    );
    window.open(
      `https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`,
      "_blank"
    );
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Check out Sylf — turns study sessions into structured quests with leveling: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const isLoggedInBannerVisible = !isLoading && !!user;

  return (
    <div
      className="min-h-screen flex flex-col justify-between relative overflow-x-hidden"
      style={{ backgroundColor: "var(--bg-void)", color: "var(--text-primary)" }}
    >
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

      {/* ─── Minimal Top Header ───────────────────────────────── */}
      <LandingNavbar hasBanner={isLoggedInBannerVisible} />

      {/* ─── Center Hero Stage ────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16 text-center max-w-3xl mx-auto w-full">
        {/* Category Pill */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary shadow-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
          <span>Coming Soon • Early Access</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-text-primary mb-5 leading-[1.15]"
          style={{ fontFamily: "'Rajdhani', sans-serif" }}
        >
          Study leveling is coming.
        </motion.h1>

        {/* Supporting Copy */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-base sm:text-lg text-text-secondary mb-10 max-w-xl leading-relaxed"
        >
          Turn dense coursework into clear daily quests with deep focus sessions and verified progression. Join the waitlist for early access beta cohorts.
        </motion.p>

        {/* Primary Waitlist Interaction */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="w-full max-w-md"
        >
          {!waitlistPass ? (
            /* Form View */
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your student email..."
                  aria-invalid={!!errorMsg}
                  aria-label="Student email address"
                  className="input-field flex-1 text-sm py-3 px-4 rounded-xl border border-border-subtle bg-bg-abyss text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors shadow-sm"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-xs sm:text-sm font-bold tracking-wider uppercase cursor-pointer disabled:opacity-60 shadow-md shrink-0 font-['Rajdhani']"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Joining...</span>
                    </>
                  ) : (
                    <>
                      <span>Join Waitlist</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-center justify-center gap-2 text-xs text-red-400 mt-1"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <p className="text-[11px] text-text-muted text-center flex items-center justify-center gap-1.5 pt-1">
                <Shield className="w-3.5 h-3.5 text-accent-primary-light" />
                <span>Free rolling beta access • No spam</span>
              </p>
            </form>
          ) : (
            /* Confirmed Pass Card */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-5 sm:p-6 rounded-2xl border border-border-subtle bg-bg-abyss shadow-lg text-left"
            >
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs sm:text-sm mb-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {waitlistPass.alreadyRegistered
                    ? "You are registered on the waitlist!"
                    : "Access Pass Confirmed!"}
                </span>
              </div>

              <p className="text-xs text-text-secondary mb-4 leading-relaxed">
                You hold queue position <strong className="text-text-primary">#{waitlistPass.position}</strong>. We will email your invitation as soon as your batch opens.
              </p>

              {/* Pass Code Card */}
              <div className="p-3.5 rounded-xl border border-border-subtle bg-bg-void/80 flex items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted font-['Rajdhani'] block">
                    Your Scholar Code
                  </span>
                  <p className="text-sm font-mono font-bold text-text-primary truncate">
                    {waitlistPass.referralCode}
                  </p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="px-3.5 py-1.5 rounded-lg bg-accent-primary text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copySuccess ? "Copied" : "Copy Link"}</span>
                </button>
              </div>

              {/* Share actions */}
              <div className="flex items-center justify-between pt-2 border-t border-border-subtle/50 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleShareTwitter}
                    className="px-2.5 py-1 rounded-md border border-border-subtle bg-bg-void text-text-secondary hover:text-text-primary hover:border-accent-primary transition-colors text-[11px] font-medium"
                  >
                    Share on X
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    className="px-2.5 py-1 rounded-md border border-border-subtle bg-bg-void text-text-secondary hover:text-text-primary hover:border-emerald-500/40 transition-colors text-[11px] font-medium"
                  >
                    WhatsApp
                  </button>
                </div>

                <button
                  onClick={handleResetPass}
                  className="text-[11px] text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1 font-medium cursor-pointer"
                >
                  <RefreshCcw className="w-3 h-3" />
                  <span>Different email</span>
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Subtle Brand Pillars */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-text-muted mt-12 font-['Rajdhani'] uppercase tracking-wider font-semibold"
        >
          <span>Structured Quests</span>
          <span>•</span>
          <span>Deep Focus & Acoustics</span>
          <span>•</span>
          <span>8-Tier Rank Progression</span>
        </motion.div>
      </main>

      {/* ─── Minimal Pre-launch Footer ────────────────────────── */}
      <LandingFooter />
    </div>
  );
}

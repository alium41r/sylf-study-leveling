"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Brain,
  Shield,
  Clock,
  Loader2,
  Copy,
} from "lucide-react";

interface HeroSectionProps {
  onSuccessSignup?: (data: {
    referralCode: string;
    position: number;
    referralCount: number;
    targetExam?: string | null;
    alreadyRegistered: boolean;
  }) => void;
}

const PASS_STORAGE_KEY = "sylf_waitlist_pass";

export function persistWaitlistPass(data: {
  referralCode: string;
  position: number;
  referralCount: number;
  targetExam?: string | null;
  alreadyRegistered: boolean;
}) {
  try {
    localStorage.setItem(PASS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable — the in-memory success card still works
  }
}

export default function HeroSection({ onSuccessSignup }: HeroSectionProps) {
  const [email, setEmail] = useState("");
  const [targetExam, setTargetExam] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [successData, setSuccessData] = useState<{
    referralCode: string;
    position: number;
    alreadyRegistered: boolean;
  } | null>(null);

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
          targetExam: targetExam.trim() || undefined,
          referredBy,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to join waitlist. Please try again.");
      }

      const pass = {
        referralCode: data.referralCode,
        position: data.position,
        referralCount: data.referralCount || 0,
        targetExam: data.targetExam || null,
        alreadyRegistered: data.alreadyRegistered,
      };
      setSuccessData({
        referralCode: pass.referralCode,
        position: pass.position,
        alreadyRegistered: pass.alreadyRegistered,
      });
      persistWaitlistPass(pass);

      if (onSuccessSignup) {
        onSuccessSignup(pass);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!successData) return;
    const refUrl = `${window.location.origin}/?ref=${successData.referralCode}`;
    navigator.clipboard.writeText(refUrl);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  return (
    <section className="relative pt-24 pb-14 sm:pt-32 sm:pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background radial glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[450px] opacity-30 dark:opacity-40 pointer-events-none -z-10"
        style={{
          background: "radial-gradient(circle, var(--accent-primary-mid) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-12 lg:gap-8 items-center">
          {/* Left Column: Core Value & Waitlist Form */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="lg:col-span-7 flex flex-col items-start text-left"
          >
            {/* System Status Label */}
            <div
              className="inline-flex items-center gap-2 mb-5 sm:mb-6 px-3.5 py-1.5 rounded-full text-[10px] sm:text-xs tracking-[0.2em] uppercase font-bold border shadow-sm backdrop-blur-md"
              style={{
                background: "var(--accent-primary-dim)",
                borderColor: "var(--accent-primary-mid)",
                color: "var(--accent-text-light)",
                fontFamily: "'Rajdhani', sans-serif",
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent-primary-light" />
              <span>SYSTEM INITIALIZATION // EARLY ACCESS</span>
            </div>

            {/* Main Headline */}
            <h1
              className="text-[32px] leading-[1.12] sm:text-5xl md:text-6xl font-extrabold tracking-tight text-text-primary mb-5 sm:mb-6 text-balance"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Turn Every Study Hour Into{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent-primary-light) 0%, var(--accent-primary) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 20px var(--accent-primary-dim))",
                }}
              >
                Rank & Progression.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[15px] leading-relaxed sm:text-lg text-text-secondary mb-7 sm:mb-8 max-w-2xl text-pretty">
              Sylf transforms your coursework and exam prep into structured AI quests, logs clean deep focus minutes, and rewards your daily consistency with XP, ranks, and cognitive stat growth.
            </p>

            {/* Waitlist Capture Card */}
            <div className="w-full max-w-xl p-5 sm:p-6 rounded-2xl border border-border-subtle bg-bg-abyss shadow-card mb-4">
              {!successData ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
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
                        className="input-field w-full text-sm sm:text-base py-3 px-4 rounded-xl border border-border-subtle bg-bg-void/80 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary flex items-center justify-center gap-2 py-3.5 sm:py-3 px-6 rounded-xl text-sm sm:text-base font-bold tracking-wider uppercase cursor-pointer disabled:opacity-70 shadow-lg shrink-0"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Securing...</span>
                        </>
                      ) : (
                        <>
                          <span>Join Waitlist</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Optional Target Exam or Subject Tag */}
                  <div className="flex flex-col gap-1 pt-1">
                    <label
                      htmlFor="hero-target-exam"
                      className="text-[10px] uppercase tracking-wider font-bold text-text-muted font-['Rajdhani']"
                    >
                      Goal / Exam <span className="text-text-muted/60 normal-case font-medium tracking-normal">(optional)</span>
                    </label>
                    <input
                      id="hero-target-exam"
                      name="targetExam"
                      type="text"
                      maxLength={100}
                      value={targetExam}
                      onChange={(e) => setTargetExam(e.target.value)}
                      placeholder="e.g. MCAT, A-Levels, Computer Science"
                      className="text-[12px] sm:text-xs py-2.5 px-3 rounded-lg border border-border-subtle/70 bg-bg-void/40 text-text-secondary placeholder:text-text-muted/60 focus:border-accent-primary/60 focus:outline-none w-full transition-colors"
                    />
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="flex items-center gap-2 text-xs text-red-400 mt-1"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <p className="text-[11px] text-text-muted mt-2 flex items-start gap-1.5 sm:items-center">
                    <Shield className="w-3.5 h-3.5 text-accent-primary-light shrink-0 mt-0.5 sm:mt-0" />
                    <span>Free early access invitations sent in weekly rolling waves. No spam.</span>
                  </p>
                </form>
              ) : (
                /* Success Confirmation State */
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col gap-3 py-1"
                >
                  <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <span>
                      {successData.alreadyRegistered
                        ? "You're already on the waitlist!"
                        : "Access Pass Confirmed!"}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    You hold position <strong className="text-text-primary">#{successData.position}</strong> in the early access queue. We will email you the moment your beta wave opens.
                  </p>

                  <div className="p-3 rounded-xl border border-accent-primary-mid/40 bg-accent-primary-dim/20 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-accent-text-light font-['Rajdhani']">
                        Your Scholar Referral Code
                      </span>
                      <p className="text-sm font-mono font-bold text-text-primary truncate">
                        {successData.referralCode}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copySuccess ? "Copied!" : "Copy Link"}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Micro Trust Points (vertical checklist on mobile, inline row from sm up) */}
            <div className="flex flex-col items-start gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6 text-xs sm:text-[13px] text-text-muted">
              <span className="flex items-center gap-2 sm:gap-1.5">
                <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                <span>Zero Account Setup Required</span>
              </span>
              <span className="flex items-center gap-2 sm:gap-1.5">
                <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                <span>AI Syllabus Dissection</span>
              </span>
              <span className="flex items-center gap-2 sm:gap-1.5">
                <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
                <span>Built for Serious Academics</span>
              </span>
            </div>

            {/* Mobile-only quick stats (replaces the full system card on phones) */}
            <div className="flex md:hidden items-center gap-2 flex-wrap mt-5 w-full max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-subtle bg-bg-abyss/70 text-[11px] font-bold text-accent-text-light font-['Rajdhani'] uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-accent-primary-light" />
                Lv. 14 Scholar
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-subtle bg-bg-abyss/70 text-[11px] font-bold text-cyan-300 font-mono">
                425 ✦ Sylph
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border-subtle bg-bg-abyss/70 text-[11px] font-bold text-emerald-400 font-mono">
                14-Day Streak
              </span>
            </div>
          </motion.div>

          {/* Right Column: Live Interface Mockup (Authentic Sylf UI) */}
          {/* Hidden on phones — the hero stays focused on one CTA on mobile;
              product mockups still appear in Core Features below. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="hidden md:block lg:col-span-5 relative"
          >
            {/* Ambient Back Glow */}
            <div className="absolute inset-0 bg-accent-primary/20 rounded-3xl blur-2xl -z-10 transform scale-95" />

            {/* Authentic Sylf System Window Card */}
            <div
              className="system-card rounded-2xl border border-border-active bg-bg-abyss/90 backdrop-blur-xl shadow-2xl p-5 sm:p-6 relative overflow-hidden"
              style={{ borderColor: "var(--border-active)" }}
            >
              {/* Window Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center font-['Rajdhani'] font-bold text-accent-text-light text-base">
                    C
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider">
                        Scholar Dossier
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary-dim text-accent-text-light font-mono font-bold">
                        Lv. 14
                      </span>
                    </div>
                    <p className="text-[11px] text-text-muted font-mono">
                      Rank C • Pure Mathematics & Biology
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block font-['Rajdhani']">
                    Sylph Balance
                  </span>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    425 ✦
                  </span>
                </div>
              </div>

              {/* Live XP Level Bar */}
              <div className="mb-5">
                <div className="flex justify-between text-xs font-['Rajdhani'] font-bold mb-1.5">
                  <span className="text-text-muted uppercase tracking-wider">Experience</span>
                  <span className="text-accent-primary-light font-mono text-[11px]">
                    1,420 / 1,850 XP (76%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-bg-shadow overflow-hidden border border-border-subtle">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-primary-light"
                    style={{ width: "76%" }}
                  />
                </div>
              </div>

              {/* Active AI Study Quests */}
              <div className="space-y-2.5 mb-5">
                <div className="flex items-center justify-between text-xs font-['Rajdhani'] font-bold uppercase tracking-wider text-text-muted">
                  <span>Active AI Quests</span>
                  <span className="text-emerald-400 font-mono text-[10px]">2 in progress</span>
                </div>

                {/* Quest Item 1 */}
                <div className="p-3 rounded-xl border border-border-subtle bg-bg-void/60 flex items-center justify-between gap-3 hover:border-accent-primary/50 transition-colors">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-accent-primary-dim text-accent-primary-light flex items-center justify-center shrink-0 mt-0.5">
                      <Brain className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate font-['Rajdhani']">
                        Calculus: Multivariable Optimization
                      </p>
                      <p className="text-[10px] text-text-muted flex items-center gap-1.5 font-mono">
                        <Clock className="w-2.5 h-2.5" /> 45 min focus • +150 XP
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold font-['Rajdhani'] uppercase tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/30 shrink-0">
                    Active
                  </span>
                </div>

                {/* Quest Item 2 */}
                <div className="p-3 rounded-xl border border-border-subtle bg-bg-void/60 flex items-center justify-between gap-3 hover:border-accent-primary/50 transition-colors">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate font-['Rajdhani']">
                        Organic Reaction Synthesis Set #4
                      </p>
                      <p className="text-[10px] text-text-muted flex items-center gap-1.5 font-mono">
                        <Clock className="w-2.5 h-2.5" /> 60 min focus • +200 XP
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded font-bold font-['Rajdhani'] uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
                    Ready
                  </span>
                </div>
              </div>

              {/* Cognitive Stats Strip */}
              <div className="pt-3 border-t border-border-subtle grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-bg-void/40 border border-border-subtle/50">
                  <span className="text-[9px] uppercase font-bold text-text-muted tracking-wider block font-['Rajdhani']">
                    Endurance
                  </span>
                  <span className="text-xs font-bold font-mono text-text-primary">48 / 100</span>
                </div>
                <div className="p-2 rounded-lg bg-bg-void/40 border border-border-subtle/50">
                  <span className="text-[9px] uppercase font-bold text-text-muted tracking-wider block font-['Rajdhani']">
                    Tenacity
                  </span>
                  <span className="text-xs font-bold font-mono text-emerald-400">14 Day Streak</span>
                </div>
                <div className="p-2 rounded-lg bg-bg-void/40 border border-border-subtle/50">
                  <span className="text-[9px] uppercase font-bold text-text-muted tracking-wider block font-['Rajdhani']">
                    Velocity
                  </span>
                  <span className="text-xs font-bold font-mono text-purple-400">3.4 Quests/Day</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

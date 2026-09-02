"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ProductScreenshot from "./ProductScreenshot";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Brain,
  Headphones,
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
    // storage unavailable
  }
}

export default function HeroSection({ onSuccessSignup }: HeroSectionProps) {
  const [email, setEmail] = useState("");
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
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 md:pt-40 md:pb-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Value Proposition & Capture */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="lg:col-span-7 flex flex-col items-start text-left"
          >
            {/* Category / Sub-tag */}
            <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-primary" />
              <span>Gamified Study Operating System</span>
            </div>

            {/* Main Headline */}
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-text-primary mb-5 leading-[1.1]"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Study with purpose.{" "}
              <span className="text-accent-text-light">
                Level up every day.
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg text-text-secondary mb-8 max-w-xl leading-relaxed">
              Sylf turns dense course syllabi into actionable daily quests, tracks your deep focus sessions with ambient acoustics, and awards verified XP to build genuine academic momentum.
            </p>

            {/* Waitlist Capture Box */}
            <div className="w-full max-w-xl p-4 sm:p-5 rounded-xl border border-border-subtle bg-bg-abyss/90 shadow-sm mb-6">
              {!successData ? (
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
                      className="input-field flex-1 text-sm py-2.5 px-3.5 rounded-lg border border-border-subtle bg-bg-void text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 px-5 rounded-lg text-xs sm:text-sm font-bold tracking-wider uppercase cursor-pointer disabled:opacity-60 shadow-sm shrink-0 font-['Rajdhani']"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Securing...</span>
                        </>
                      ) : (
                        <>
                          <span>Join Waitlist</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="flex items-center gap-2 text-xs text-red-400 mt-0.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{errorMsg}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px] text-text-muted">
                    <span>Free rolling beta access • No credit card</span>
                    <Link
                      href="/login"
                      className="text-text-secondary hover:text-text-primary hover:underline font-medium"
                    >
                      Already registered? Log in
                    </Link>
                  </div>
                </form>
              ) : (
                /* Success Card */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col gap-3 py-1"
                >
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs sm:text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {successData.alreadyRegistered
                        ? "You're already on the waitlist!"
                        : "Access Pass Confirmed!"}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    You hold position <strong className="text-text-primary">#{successData.position}</strong>. We will email you when your beta wave opens.
                  </p>

                  <div className="p-3 rounded-lg border border-border-subtle bg-bg-void/80 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted font-['Rajdhani']">
                        Queue #{successData.position} • Code
                      </span>
                      <p className="text-xs sm:text-sm font-mono font-bold text-text-primary truncate">
                        {successData.referralCode}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 rounded-lg bg-accent-primary text-white text-xs font-bold font-['Rajdhani'] uppercase tracking-wider hover:opacity-90 transition-opacity cursor-pointer shrink-0 inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copySuccess ? "Copied" : "Copy Link"}</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Key Differentiators / Value Points */}
            <div className="flex flex-wrap items-center gap-5 sm:gap-6 text-xs text-text-secondary">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Structured Syllabus Breakdown</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Clean Focus Timer & Acoustics</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>8-Tier Progression Ladder</span>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Live Interface Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
            className="lg:col-span-5 relative"
          >
            <ProductScreenshot
              title="sylf.app / workspace"
              badge="Dashboard"
              alt="Sylf scholar workspace showing active quest and XP progress"
              aspectRatio="auto"
            >
              <div className="flex flex-col gap-3.5 text-left text-xs">
                {/* Profile Strip */}
                <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-accent-primary-dim border border-accent-primary-mid/60 flex items-center justify-center font-['Rajdhani'] font-bold text-accent-text-light text-xs">
                      C
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider text-xs">
                          Scholar Dossier
                        </span>
                        <span className="text-[10px] px-1 py-0.2 rounded bg-accent-primary-dim text-accent-text-light font-mono font-semibold">
                          Lv. 14
                        </span>
                      </div>
                      <p className="text-[10px] text-text-muted font-mono">
                        Rank C • Pure Mathematics & Biology
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-[10px] uppercase text-text-muted block font-['Rajdhani'] font-bold">
                      Sylph Currency
                    </span>
                    <span className="text-xs font-bold text-cyan-400">425 ✦</span>
                  </div>
                </div>

                {/* Level Progress */}
                <div>
                  <div className="flex justify-between text-[11px] font-['Rajdhani'] font-bold mb-1">
                    <span className="text-text-muted uppercase tracking-wider">Rank XP</span>
                    <span className="text-accent-primary-light font-mono">
                      1,420 / 1,850 XP (76%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-bg-void overflow-hidden border border-border-subtle">
                    <div
                      className="h-full rounded-full bg-accent-primary"
                      style={{ width: "76%" }}
                    />
                  </div>
                </div>

                {/* Active Focus Session */}
                <div className="p-3 rounded-lg border border-accent-primary-mid/40 bg-accent-primary-dim/15">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-text-light font-['Rajdhani'] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Active Study Session
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                      In Flow
                    </span>
                  </div>
                  <p className="text-xs font-bold text-text-primary font-['Rajdhani'] mb-1">
                    Calculus: Multivariable Optimization
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
                    <span>32:14 remaining</span>
                    <span className="flex items-center gap-1 text-accent-primary-light">
                      <Headphones className="w-2.5 h-2.5" /> 40Hz Binaural Acoustics
                    </span>
                  </div>
                </div>

                {/* Upcoming Quests */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted font-['Rajdhani']">
                    Next in Queue
                  </span>
                  <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-void/60 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Brain className="w-3.5 h-3.5 text-accent-primary-light shrink-0" />
                      <span className="text-[11px] font-medium text-text-primary truncate">
                        Organic Synthesis Reaction Sets #4
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-text-muted shrink-0">
                      60m • +200 XP
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="pt-2 border-t border-border-subtle grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="p-1.5 rounded bg-bg-void/40 border border-border-subtle">
                    <span className="text-text-muted font-['Rajdhani'] uppercase block font-bold">Focus Today</span>
                    <span className="font-mono font-bold text-text-primary">2h 45m</span>
                  </div>
                  <div className="p-1.5 rounded bg-bg-void/40 border border-border-subtle">
                    <span className="text-text-muted font-['Rajdhani'] uppercase block font-bold">Consistency</span>
                    <span className="font-mono font-bold text-emerald-400">14-Day Streak</span>
                  </div>
                  <div className="p-1.5 rounded bg-bg-void/40 border border-border-subtle">
                    <span className="text-text-muted font-['Rajdhani'] uppercase block font-bold">Quests Done</span>
                    <span className="font-mono font-bold text-accent-primary-light">12 / 15</span>
                  </div>
                </div>
              </div>
            </ProductScreenshot>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

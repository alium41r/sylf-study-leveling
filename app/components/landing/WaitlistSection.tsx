"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Shield,
  Loader2,
  RefreshCcw,
} from "lucide-react";

export interface WaitlistPass {
  referralCode: string;
  position: number;
  referralCount: number;
  targetExam?: string | null;
  alreadyRegistered: boolean;
}

interface WaitlistSectionProps {
  initialPass?: WaitlistPass | null;
  initialCode?: string | null;
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

export default function WaitlistSection({ initialPass, initialCode }: WaitlistSectionProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [targetExam, setTargetExam] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  const [waitlistPass, setWaitlistPass] = useState<WaitlistPass | null>(null);

  useEffect(() => {
    if (initialPass) {
      setWaitlistPass(initialPass);
      persistPass(initialPass);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = initialCode || urlParams.get("pass");
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
  }, [initialCode, initialPass]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
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
          name: name.trim() || undefined,
          targetExam: targetExam.trim() || undefined,
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
        targetExam: data.targetExam,
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
    setName("");
    setTargetExam("");
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
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Check out Sylf — turns study sessions into structured quests with leveling: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  return (
    <section id="waitlist" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-10 rounded-2xl border border-border-subtle bg-bg-abyss/90 shadow-md relative overflow-hidden">
          {!waitlistPass ? (
            /* Form View */
            <div className="text-center">
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
                <span>Early Access Beta</span>
              </div>

              <h2
                className="text-3xl sm:text-4xl font-extrabold text-text-primary mb-3 tracking-tight"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                Join the Early Access Waitlist
              </h2>

              <p className="text-sm sm:text-base text-text-secondary max-w-lg mx-auto mb-6 leading-relaxed">
                Reserve your spot for upcoming beta cohorts. Completely free during early access with zero spam.
              </p>

              <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-3.5 text-left">
                <div>
                  <label
                    htmlFor="waitlist-email"
                    className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1"
                  >
                    Student Email Address *
                  </label>
                  <input
                    id="waitlist-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. scholar@university.edu"
                    aria-invalid={!!errorMsg}
                    className="input-field w-full text-sm py-2.5 px-3.5 rounded-lg border border-border-subtle bg-bg-void text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="waitlist-name"
                      className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1"
                    >
                      Name or Handle (Optional)
                    </label>
                    <input
                      id="waitlist-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="input-field w-full text-sm py-2.5 px-3 rounded-lg border border-border-subtle bg-bg-void text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="waitlist-target-exam"
                      className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1"
                    >
                      Target Exam / Field
                    </label>
                    <input
                      id="waitlist-target-exam"
                      name="targetExam"
                      type="text"
                      maxLength={100}
                      value={targetExam}
                      onChange={(e) => setTargetExam(e.target.value)}
                      placeholder="e.g. MCAT, CS, A-Levels"
                      className="input-field w-full text-sm py-2.5 px-3 rounded-lg border border-border-subtle bg-bg-void text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs text-red-400 p-2 rounded-lg bg-red-500/10 border border-red-500/20"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full py-3 rounded-lg text-sm font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-60 font-['Rajdhani'] mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Securing Pass...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Early Access</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-text-muted text-center flex items-center justify-center gap-1.5 pt-1">
                  <Shield className="w-3.5 h-3.5 text-accent-primary-light" />
                  <span>Strictly for cohort notifications. Zero spam.</span>
                </p>
              </form>
            </div>
          ) : (
            /* Digital Pass View */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center max-w-lg mx-auto"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-5 h-5" />
              </div>

              <span className="text-xs uppercase font-bold tracking-wider text-emerald-400 font-['Rajdhani'] block mb-1">
                {waitlistPass.alreadyRegistered ? "WELCOME BACK" : "ACCESS PASS INITIALIZED"}
              </span>

              <h3
                className="text-2xl font-extrabold text-text-primary mb-2"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                You Are #{waitlistPass.position} on the Waitlist
              </h3>

              <p className="text-xs sm:text-sm text-text-secondary mb-5 leading-relaxed">
                We are onboarding scholars in rolling cohorts. We will email your invite link as soon as your batch opens.
              </p>

              {/* Scholar Digital Pass Card */}
              <div className="p-4 rounded-xl border border-border-subtle bg-bg-void/90 text-left mb-5 font-mono text-xs shadow-inner">
                <div className="flex justify-between items-center pb-2.5 mb-2.5 border-b border-border-subtle">
                  <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
                    SYLF SCHOLAR PASS
                  </span>
                  <span className="text-emerald-400 font-semibold">STATUS: CONFIRMED</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-2.5">
                  <div>
                    <span className="text-[10px] text-text-muted uppercase block">Queue Position</span>
                    <span className="text-sm font-bold text-text-primary">#{waitlistPass.position}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase block">Pass Code</span>
                    <span className="text-sm font-bold text-accent-text-light truncate block">
                      {waitlistPass.referralCode}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle/50 flex justify-between text-[11px] text-text-muted">
                  <span>Goal: {waitlistPass.targetExam || "General Academic"}</span>
                  <span>Invited: {waitlistPass.referralCount}</span>
                </div>
              </div>

              {/* Share Actions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Your referral link"
                    value={shareUrl}
                    className="text-xs py-2 px-3 rounded-lg border border-border-subtle bg-bg-void text-text-secondary w-full select-all font-mono"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="btn-primary py-2 px-3.5 rounded-lg text-xs font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copySuccess ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-2.5 pt-1">
                  <button
                    onClick={handleShareTwitter}
                    className="px-3.5 py-1.5 rounded-lg border border-border-subtle bg-bg-void hover:border-accent-primary text-text-secondary hover:text-text-primary text-xs font-semibold font-['Rajdhani'] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Share on X
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    className="px-3.5 py-1.5 rounded-lg border border-border-subtle bg-bg-void hover:border-emerald-500/40 text-text-secondary hover:text-text-primary text-xs font-semibold font-['Rajdhani'] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Share on WhatsApp
                  </button>
                </div>

                <div className="pt-2 border-t border-border-subtle/40">
                  <button
                    onClick={handleResetPass}
                    className="text-[11px] text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <RefreshCcw className="w-3 h-3" />
                    <span>Join with a different email</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

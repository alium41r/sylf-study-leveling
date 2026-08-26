"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Copy,
  Share2,
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
  /** Set right after a fresh hero signup so the pass card appears without
   *  an extra round-trip and without being mislabeled as a returning user. */
  initialPass?: WaitlistPass | null;
  /** Backwards-compatible: still supports an externally fetched code. */
  initialCode?: string | null;
}

const STORAGE_KEY = "sylf_waitlist_pass";

function persistPass(pass: WaitlistPass) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pass));
  } catch {
    // storage unavailable (private mode / disabled) — pass still works in-memory
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
    // corrupted entry — ignore
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
    // 1. Fresh hero signup — the parent hands us the pass directly.
    if (initialPass) {
      setWaitlistPass(initialPass);
      persistPass(initialPass);
      return;
    }

    // 2. Explicit recovery link (?pass=CODE) — fetch the pass from the server.
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

    // 3. Returning visitor — restore their saved pass so the section keeps
    //    showing "you're already in" instead of silently asking them to
    //    re-submit an email that is already registered.
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

  // Lets a shared device / second scholar re-open the form.
  const handleResetPass = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
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
      "I just joined the early access waitlist for Sylf — the AI-powered gamified study leveling system. Join the next beta wave with me:"
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`, "_blank");
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Check out Sylf — turns studying into an RPG with AI quests and leveling: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  return (
    <section id="waitlist" className="py-16 sm:py-20 md:py-28 relative">
      {/* Background Glow */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none -z-10"
        style={{
          background: "radial-gradient(circle at 50% 50%, var(--accent-primary-dim) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-12 rounded-2xl sm:rounded-3xl border border-border-active bg-bg-abyss shadow-2xl relative overflow-hidden">
          {/* Top Decorative Border */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent-primary to-transparent opacity-80" />

          {!waitlistPass ? (
            /* ─── Form State ───────────────────────────────────── */
            <div className="text-center">
              <div
                className="inline-flex items-center gap-2 mb-4 px-3.5 py-1.5 rounded-full text-xs tracking-[0.2em] uppercase font-bold border"
                style={{
                  background: "var(--accent-primary-dim)",
                  borderColor: "var(--accent-primary-mid)",
                  color: "var(--accent-text-light)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>EARLY ACCESS INVITATION</span>
              </div>

              <h2
                className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                Secure Your Scholar Access Pass
              </h2>

              <p className="text-sm sm:text-base text-text-secondary max-w-xl mx-auto mb-6 sm:mb-8 leading-relaxed">
                Join the waitlist to receive early beta access invitations. No credit card, no ads, and no complicated setup.
              </p>

              <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-4 text-left">
                <div>
                  <label
                    htmlFor="waitlist-email"
                    className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5"
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
                    className="input-field w-full text-sm sm:text-base py-3 px-4 rounded-xl border border-border-subtle bg-bg-void/80 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="waitlist-name"
                      className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5"
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
                      className="input-field w-full text-sm py-3 px-3 rounded-xl border border-border-subtle bg-bg-void/80 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="waitlist-target-exam"
                      className="block text-xs uppercase font-bold text-text-muted tracking-wider font-['Rajdhani'] mb-1.5"
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
                      className="input-field w-full text-sm py-3 px-3 rounded-xl border border-border-subtle bg-bg-void/80 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="flex items-center gap-2 text-xs text-red-400 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary w-full py-4 sm:py-3.5 rounded-xl text-base font-bold tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer shadow-xl disabled:opacity-70 mt-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Securing Access Pass...</span>
                    </>
                  ) : (
                    <>
                      <span>Get Early Access</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-text-muted text-center flex items-center justify-center gap-1.5 pt-2">
                  <Shield className="w-3.5 h-3.5 text-accent-primary-light" />
                  <span>Your email is strictly used for beta notifications. No third-party sharing.</span>
                </p>
              </form>
            </div>
          ) : (
            /* ─── Confirmed Access Pass ────────────────────────── */
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center max-w-xl mx-auto"
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <span className="text-xs uppercase font-bold tracking-widest text-emerald-400 font-['Rajdhani'] block mb-1">
                {waitlistPass.alreadyRegistered ? "WELCOME BACK" : "ACCESS PASS INITIALIZED"}
              </span>

              <h3
                className="text-2xl sm:text-3xl font-extrabold text-text-primary mb-2 text-balance"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                You Are #{waitlistPass.position} on the Waitlist
              </h3>

              <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
                We are admitting scholars in rolling beta batches. We will send an email to you as soon as your access wave is ready.
              </p>

              {/* Digital Pass Card */}
              <div className="p-4 sm:p-5 rounded-2xl border border-accent-primary-mid/50 bg-bg-void/90 text-left mb-6 shadow-inner font-mono">
                <div className="flex justify-between items-center pb-3 mb-3 border-b border-border-subtle text-xs">
                  <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
                    SYLF SCHOLAR PASS
                  </span>
                  <span className="text-emerald-400 font-bold">STATUS: CONFIRMED</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span className="text-[10px] text-text-muted uppercase block">Queue Number</span>
                    <span className="text-sm font-bold text-text-primary">#{waitlistPass.position}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase block">Pass Code</span>
                    <span className="text-sm font-bold text-accent-primary-light truncate block">
                      {waitlistPass.referralCode}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle/50 flex justify-between text-[11px] text-text-secondary">
                  <span>Goal: {waitlistPass.targetExam || "General Academic"}</span>
                  <span>Invited Scholars: {waitlistPass.referralCount}</span>
                </div>
              </div>

              {/* Referral Sharing Action Block */}
              <div className="space-y-3">
                <p className="text-xs text-text-muted font-medium">
                  Invite your study partners to prioritize your beta wave:
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Your referral link"
                    value={shareUrl}
                    className="text-xs py-2.5 px-3 rounded-xl border border-border-subtle bg-bg-void text-text-secondary w-full select-all font-mono"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="btn-primary py-2.5 px-4 rounded-xl text-xs font-bold font-['Rajdhani'] uppercase tracking-wider flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copySuccess ? "Copied!" : "Copy"}</span>
                  </button>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={handleShareTwitter}
                    className="px-4 py-2 rounded-xl border border-border-subtle bg-bg-void/80 hover:border-accent-primary text-text-secondary hover:text-text-primary text-xs font-semibold font-['Rajdhani'] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Share on X
                  </button>
                  <button
                    onClick={handleShareWhatsApp}
                    className="px-4 py-2 rounded-xl border border-border-subtle bg-bg-void/80 hover:border-emerald-500/50 text-text-secondary hover:text-text-primary text-xs font-semibold font-['Rajdhani'] uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Share on WhatsApp
                  </button>
                </div>

                <div className="pt-3 border-t border-border-subtle/50 flex items-center justify-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-text-muted" />
                  <button
                    onClick={handleResetPass}
                    className="text-[11px] text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-1 font-semibold cursor-pointer"
                  >
                    <RefreshCcw className="w-3 h-3" />
                    Join with a different email
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

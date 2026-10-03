"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  Lock,
  X,
  Clock,
  AlertCircle,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { SystemApertureIcon } from "@/app/components/icons";
import CustomDatePicker from "./CustomDatePicker";

export interface QuotaInfo {
  used: number;
  /** `null` when the account holds the unlimited entitlement (no finite cap). */
  limit: number | null;
  /** `null` when the account holds the unlimited entitlement. */
  remaining: number | null;
  resetsAt: string;
  allowed?: boolean;
  /**
   * Explicit unlimited state for a configured owner account. Server-derived
   * from the authenticated session only — the client can neither set nor
   * request it. The UI must branch on this flag rather than inventing a
   * large placeholder number.
   */
  unlimited?: boolean;
}

interface AiPlannerPanelProps {
  quota?: QuotaInfo | null;
  onQuotaRefresh?: () => void;
  sessionId?: number | null;
  /** Fired once a plan finishes generating. */
  onComplete?: (result: any) => void;
  /** Inline rendering (workspace tab) instead of modal body styling. */
  embedded?: boolean;
  /** Shown on the embedded success card to jump into the conversation. */
  onViewConversation?: () => void;
  /** Used by the locked view's Close action when rendered inside a modal. */
  onClose?: () => void;
}

/**
 * The AI Study Planner, extracted so it can live in two places:
 *  - the classic modal (quick action from the overlay / anywhere)
 *  - the dedicated System workspace Planner tab
 * The SSE generation flow, quota handling and state machine are
 * unchanged from the original modal implementation.
 */
export default function AiPlannerPanel({
  quota: propQuota,
  onQuotaRefresh,
  sessionId,
  onComplete,
  embedded = false,
  onViewConversation,
  onClose,
}: AiPlannerPanelProps) {
  const [goalTitle, setGoalTitle] = useState("");
  const [syllabusText, setSyllabusText] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [effortLevel, setEffortLevel] = useState(10); // Hours per week
  const [isGenerating, setIsGenerating] = useState(false);

  const [localQuota, setLocalQuota] = useState<QuotaInfo | null>(propQuota || null);
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successResult, setSuccessResult] = useState<any>(null);

  const thoughtsEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync prop quota to local quota
  useEffect(() => {
    if (propQuota !== undefined) {
      setLocalQuota(propQuota);
    }
  }, [propQuota]);

  // Fetch latest quota on mount
  useEffect(() => {
    const fetchLatestQuota = async () => {
      try {
        const res = await fetch("/api/ai-usage");
        if (res.ok) {
          const data = await res.json();
          if (data?.planner) {
            setLocalQuota(data.planner);
          }
        }
      } catch (err) {
        console.error("Failed to fetch planner quota:", err);
      }
    };

    fetchLatestQuota();
  }, []);

  // Abort any in-flight generation on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    if (thoughtsEndRef.current) {
      thoughtsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [thoughts]);

  // An unlimited account is never exhausted: its `remaining` is deliberately
  // `null`, which must not be read as "0 left".
  const isQuotaExhausted =
    localQuota !== null &&
    !localQuota.unlimited &&
    (localQuota.remaining === 0 || localQuota.allowed === false);

  const formatResetTime = (isoString?: string) => {
    if (!isoString) return "Midnight (12:00 AM)";
    try {
      const target = new Date(isoString);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();

      let countdown = "";
      if (diffMs > 0) {
        const totalMins = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        countdown = hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
      }

      const localTime = target.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      return countdown ? `Midnight (${countdown})` : `Midnight (${localTime})`;
    } catch {
      return "Midnight (12:00 AM)";
    }
  };

  const resetForm = () => {
    setSuccess(false);
    setSuccessResult(null);
    setGoalTitle("");
    setSyllabusText("");
    setTargetDate("");
    setEffortLevel(10);
    setThoughts([]);
    setError(null);
  };

  const handleGenerate = async () => {
    if (isQuotaExhausted) {
      setError("Weekly generation limit reached. Free tier accounts receive 1 AI Study Plan per week.");
      return;
    }

    if (!goalTitle.trim()) {
      setError("Please enter a subject or goal title.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setThoughts(["Initializing Multi-Agent Intelligence Engine..."]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/ai-planner", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: goalTitle,
          syllabus: syllabusText,
          effortHours: effortLevel,
          targetDate: targetDate || null,
          sessionId: sessionId || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 429 || errData.error === "quota_exceeded") {
          setLocalQuota((prev) => (prev ? { ...prev, remaining: 0, allowed: false } : null));
          throw new Error("Daily limit reached. You have used your 1 free AI Study Plan for today.");
        }
        throw new Error(errData.error || "Failed to generate plan");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (part.startsWith("data: ")) {
              const dataStr = part.substring(6);
              try {
                const data = JSON.parse(dataStr);
                if (data.type === "thought") {
                  setThoughts((prev) => [...prev, data.text]);
                } else if (data.type === "result") {
                  setThoughts((prev) => [...prev, "Plan finalized and quests created!"]);

                  // Server-supplied quota is authoritative. The local fallback
                  // only applies when it is absent: it must keep an unlimited
                  // account unlimited instead of faking an exhausted state.
                  const nextQuota: QuotaInfo = data.quota || {
                    used: (localQuota?.used ?? 0) + 1,
                    limit: localQuota?.unlimited ? null : localQuota?.limit ?? 1,
                    remaining: localQuota?.unlimited ? null : 0,
                    allowed: localQuota?.unlimited === true,
                    unlimited: localQuota?.unlimited === true,
                    resetsAt: localQuota?.resetsAt || new Date().toISOString(),
                  };
                  setLocalQuota(nextQuota);
                  if (onQuotaRefresh) onQuotaRefresh();

                  setIsGenerating(false);
                  setSuccess(true);
                  setSuccessResult(data);
                  if (onComplete) onComplete(data);
                  return;
                } else if (data.type === "error") {
                  const displayErr =
                    data.message === "AI_TIMEOUT" || data.message?.includes("AI_TIMEOUT")
                      ? "Generation took longer than expected while researching multiple topics. Please try again or refine your topic scope."
                      : data.message || "Failed to generate study plan.";
                  setError(displayErr);
                  setIsGenerating(false);
                  setThoughts([]);
                  return;
                }
              } catch (e) {
                console.error("Error parsing SSE JSON:", e, dataStr);
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setIsGenerating(false);
        setThoughts([]);
        return;
      }
      const displayErr =
        err.message === "AI_TIMEOUT" || err.message?.includes("AI_TIMEOUT")
          ? "Generation took longer than expected while researching multiple topics. Please try again."
          : err.message || "Failed to generate study plan.";
      setError(displayErr);
      setIsGenerating(false);
      setThoughts([]);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // ─── Views ───────────────────────────────────────────────────

  if (success && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 px-4 space-y-5">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.2)]">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-bg-abyss border border-border-subtle text-accent-text-light">
            <SystemApertureIcon size={16} />
          </div>
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
            Study Plan Generated
          </h3>
          <p className="text-xs text-text-secondary font-['Rajdhani'] leading-relaxed">
            Your adaptive syllabus and scheduled quests are ready. The full breakdown was posted
            into The System conversation
            {successResult?.sessionId ? ` (thread #${successResult.sessionId})` : ""}.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {embedded && onViewConversation && (
            <button
              type="button"
              onClick={onViewConversation}
              className="py-2.5 px-5 rounded-xl text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-all hover:brightness-105 active:scale-95"
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
                color: "#ffffff",
                textShadow: "0 1px 2px rgba(0, 0, 0, 0.35)",
                boxShadow: "0 4px 14px var(--accent-primary-dim, rgba(134, 170, 244, 0.25))",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>View Conversation</span>
            </button>
          )}
          <button
            type="button"
            onClick={resetForm}
            className="py-2.5 px-5 rounded-xl bg-bg-panel hover:bg-bg-shadow border border-border-subtle hover:border-accent-primary text-xs font-['Rajdhani'] font-bold text-text-primary uppercase tracking-wider transition-all flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Create Another</span>
          </button>
        </div>
      </div>
    );
  }

  if (isQuotaExhausted && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-8 px-4 space-y-5 relative">
        {/* Ambient amber glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Glowing Lock Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/35 flex items-center justify-center text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.22)] backdrop-blur-sm">
            <Lock className="w-9 h-9 animate-pulse" />
          </div>
          <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-[#0d1117] border border-amber-500/40 text-amber-400 shadow-md">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="space-y-2 max-w-md relative z-10">
          <h3 className="text-xl sm:text-2xl font-bold font-['Rajdhani'] text-text-primary tracking-wide uppercase">
            Weekly Planner Quota Reached
          </h3>
          <p className="text-xs sm:text-sm text-text-secondary font-['Rajdhani'] leading-relaxed">
            You have already used your{" "}
            <span className="text-amber-400 font-bold">1 free AI Study Plan</span> for this week. Free
            tier accounts receive 1 comprehensive multi-week syllabus generation per week.
          </p>
        </div>

        {/* Reset Information Card */}
        <div className="w-full max-w-sm p-4 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between text-xs font-['Rajdhani'] relative z-10 shadow-sm">
          <div className="flex items-center gap-2.5 text-text-muted">
            <Clock className="w-4 h-4 text-accent-text-light" />
            <span className="font-semibold text-text-secondary">Quota Reset:</span>
          </div>
          <span className="font-bold font-mono text-accent-text-light bg-accent-primary/10 border border-accent-primary/25 px-2.5 py-1 rounded-lg">
            {formatResetTime(localQuota?.resetsAt)}
          </span>
        </div>

        {!embedded && (
          <div className="w-full max-w-sm pt-2 relative z-10">
            <button
              type="button"
              onClick={() => (onClose ? onClose() : resetForm())}
              className="w-full py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-accent-primary/50 text-xs font-['Rajdhani'] font-bold text-text-primary uppercase tracking-wider transition-all shadow-sm active:scale-98"
            >
              Close Planner
            </button>
          </div>
        )}
      </div>
    );
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col py-4 space-y-6">
        <div className="flex justify-center mb-2">
          <div className="relative w-20 h-20">
            <motion.div
              className="absolute inset-0 rounded-full border-t-2 border-accent-primary opacity-80"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-2 rounded-full border-r-2 border-accent-primary-light opacity-80"
              animate={{ rotate: -360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-accent-text-light">
              <SystemApertureIcon size={26} className="animate-pulse" />
            </div>
          </div>
        </div>

        {/* Thoughts Terminal */}
        <div className="rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs bg-bg-void border border-border-subtle text-accent-text-light shadow-inner">
          {thoughts.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-2 flex items-start gap-2"
            >
              <span className="text-text-muted select-none">{">"}</span>
              <span className="leading-relaxed">{t}</span>
            </motion.div>
          ))}
          <div ref={thoughtsEndRef} />
        </div>

        {/* Generation Status Indicator */}
        <div className="flex items-center justify-center pt-1">
          <span className="text-[11px] text-text-muted font-mono flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-primary animate-ping" />
            <span>Researching syllabus & structuring quests...</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-['Rajdhani'] font-bold flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Subject / Master Topic */}
      <div>
        <label className="block text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary mb-1.5">
          What do you want to master?
        </label>
        <input
          type="text"
          value={goalTitle}
          onChange={(e) => setGoalTitle(e.target.value)}
          placeholder="e.g., AP Physics 1, AWS Cloud Practitioner, Quantum Mechanics..."
          className="w-full rounded-xl px-4 py-3 bg-bg-void border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-all shadow-inner"
        />
      </div>

      {/* Custom In-App Calendar Date Picker */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
            Deadline / Exam Date (Optional)
          </label>
          {targetDate && (
            <span className="text-[11px] text-accent-text-light font-mono font-bold">
              {targetDate}
            </span>
          )}
        </div>

        <CustomDatePicker
          value={targetDate}
          onChange={setTargetDate}
          placeholder="Pick deadline or target exam date..."
        />
      </div>

      {/* Syllabus / Topics */}
      <div>
        <label className="block text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary mb-1.5">
          Syllabus / Topics (Optional)
        </label>
        <textarea
          value={syllabusText}
          onChange={(e) => setSyllabusText(e.target.value)}
          placeholder="Paste your chapters, topics, or course outline here..."
          rows={3}
          className="w-full rounded-xl px-4 py-3 bg-bg-void border border-border-subtle text-xs font-['Rajdhani'] text-text-primary placeholder:text-text-muted resize-none focus:outline-none focus:border-accent-primary transition-all shadow-inner leading-relaxed"
        />
      </div>

      {/* Target Effort Level Slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-xs font-bold font-['Rajdhani'] uppercase tracking-wider text-text-primary">
            Target Effort
          </label>
          <span className="text-xs text-accent-text-light font-bold font-['Rajdhani'] bg-accent-primary-dim px-3 py-1 rounded-full border border-accent-primary-mid">
            {effortLevel} hrs / week
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="40"
          value={effortLevel}
          onChange={(e) => setEffortLevel(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-bg-void border border-border-subtle"
          style={{ accentColor: "var(--accent-primary)" }}
        />
        <div className="flex justify-between text-[10px] text-text-muted mt-1.5 font-['Rajdhani'] font-medium">
          <span>1 hr / wk</span>
          <span>40 hrs / wk</span>
        </div>
      </div>

      {/* Submit Action */}
      <button
        type="button"
        onClick={handleGenerate}
        className="w-full py-3.5 rounded-xl text-xs font-['Rajdhani'] font-bold uppercase tracking-wider mt-2 flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer hover:brightness-105 active:scale-[0.99]"
        style={{
          background: "linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-primary-light) 100%)",
          color: "#ffffff",
          textShadow: "0 1px 2px rgba(0, 0, 0, 0.35)",
          boxShadow: "0 4px 16px var(--accent-primary-dim, rgba(134, 170, 244, 0.25))",
          border: "1px solid rgba(255, 255, 255, 0.2)",
        }}
      >
        <SystemApertureIcon size={16} />
        <span>Generate AI Study Plan</span>
      </button>
    </div>
  );
}

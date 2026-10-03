"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";
import { X, Check } from "lucide-react";
import styles from "../Calendar.module.css";

interface StudyScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGoalMinutes: number;
  initialRestDays: number[];
  initialEnableHpPenalty: boolean;
  onSaveSuccess: (data: {
    dailyGoalMinutes: number;
    restDays: number[];
    enableHpPenalty: boolean;
  }) => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: "Mon", full: "Monday" },
  { id: 2, label: "Tue", full: "Tuesday" },
  { id: 3, label: "Wed", full: "Wednesday" },
  { id: 4, label: "Thu", full: "Thursday" },
  { id: 5, label: "Fri", full: "Friday" },
  { id: 6, label: "Sat", full: "Saturday" },
  { id: 0, label: "Sun", full: "Sunday" },
];

export default function StudyScheduleModal({
  isOpen,
  onClose,
  initialGoalMinutes,
  initialRestDays,
  initialEnableHpPenalty,
  onSaveSuccess,
}: StudyScheduleModalProps) {
  const [goalMinutes, setGoalMinutes] = useState(initialGoalMinutes || 120);
  const [restDays, setRestDays] = useState<number[]>(initialRestDays || [0]);
  const [enableHpPenalty, setEnableHpPenalty] = useState(initialEnableHpPenalty ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const goalHours = Math.floor(goalMinutes / 60);
  const goalMins = goalMinutes % 60;

  const toggleRestDay = (dayId: number) => {
    if (restDays.includes(dayId)) {
      setRestDays(restDays.filter((d) => d !== dayId));
    } else {
      if (restDays.length >= 6) {
        setErrorMsg("You must have at least one active study day per week.");
        return;
      }
      setErrorMsg(null);
      setRestDays([...restDays, dayId].sort((a, b) => a - b));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/user/study-schedule", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dailyGoalMinutes: goalMinutes,
          restDays,
          enableHpPenalty,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update study schedule");
      }

      const updated = await res.json();
      onSaveSuccess(updated);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="study-schedule-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
        >
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="fixed inset-0 bg-bg-overlay backdrop-blur-md transition-opacity"
          />

          {/* Modal Window */}
          <motion.div
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={`relative z-10 w-full max-w-xl ${styles.modalContent} rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8`}
          >
            <div className={styles.topHighlight} />

            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent-dim border border-accent-mid/30 flex items-center justify-center text-accent-light shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="6" />
                    <circle cx="12" cy="12" r="2" />
                  </svg>
                </div>
                <div>
                  <div className={styles.eyebrow}>
                    <span className={styles.eyebrowDot} />
                    Schedule Configuration
                  </div>
                  <h2 className={styles.title} style={{ fontSize: "1.45rem" }}>
                    Daily Study Goal & <em>Rest Days</em>
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-colors cursor-pointer text-text-muted hover:text-text-primary"
              >
                <X size={16} />
              </button>
            </div>

          {errorMsg && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-6 mt-6">
            {/* Section 1: Daily Focus Target */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-text-primary uppercase tracking-wider font-['Rajdhani'] flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth={2} />
                    <polyline points="12 6 12 12 16 14" strokeWidth={2} />
                  </svg>
                  Daily Focus Target
                </label>
                <span className="font-mono font-bold text-base sm:text-lg text-accent-text-light px-3 py-0.5 rounded-full bg-accent-dim border border-accent-mid/30">
                  {goalHours > 0 ? `${goalHours}h ${goalMins > 0 ? `${goalMins}m` : ""}` : `${goalMins}m`}{" "}
                  <span className="text-xs font-normal text-text-muted">/ day</span>
                </span>
              </div>

              {/* Interactive Slider */}
              <input
                type="range"
                min="15"
                max="480"
                step="15"
                value={goalMinutes}
                onChange={(e) => setGoalMinutes(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-bg-shadow rounded-lg appearance-none cursor-pointer accent-accent-primary"
              />

              {/* Quick Presets */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {[30, 60, 90, 120, 180, 240].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setGoalMinutes(mins)}
                    className={`px-3 py-1 text-xs rounded-full font-mono transition-all ${
                      goalMinutes === mins
                        ? "bg-accent-primary text-white font-bold shadow-md shadow-accent-primary/20 scale-105"
                        : "bg-bg-shadow hover:bg-bg-abyss text-text-secondary border border-border-subtle"
                    }`}
                  >
                    {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                  </button>
                ))}
              </div>
            </div>

            {/* Section 2: Designated Rest Days */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-text-primary uppercase tracking-wider font-['Rajdhani'] flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  Designated Rest Days
                </label>
                <span className="text-xs text-text-muted font-['Rajdhani']">
                  {restDays.length} {restDays.length === 1 ? "day" : "days"} selected
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Rest days are exempt from daily study targets and HP penalties. The AI planner will never assign daily milestones on these days, and your streaks are protected.
              </p>

              {/* 7-Day Pill Selector */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-1">
                {DAYS_OF_WEEK.map((d) => {
                  const isSelected = restDays.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleRestDay(d.id)}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl transition-all border ${
                        isSelected
                          ? "bg-accent-dim border-accent-primary text-accent-light font-bold shadow-sm"
                          : "bg-bg-shadow hover:bg-bg-abyss border-border-subtle text-text-muted hover:text-text-primary"
                      }`}
                    >
                      <span className="text-xs uppercase tracking-wider font-['Rajdhani']">{d.label}</span>
                      <div className="mt-1 flex items-center justify-center">
                        {isSelected ? (
                          <svg className="w-3 h-3 text-accent-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-border-subtle" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Mandatory HP Penalty Info Card */}
            <div className="pt-2">
              <div className="p-4 rounded-xl bg-bg-abyss border border-border-subtle flex items-center justify-between gap-4">
                <div className="flex gap-3 min-w-0 items-center">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary font-['Rajdhani'] flex items-center gap-2">
                      HP Penalty Engine
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30 uppercase">
                        Always Active
                      </span>
                    </p>
                    <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                      Deducts <strong className="text-red-400 font-mono">-15 HP</strong> when your daily focus time falls short of your daily target on active (non-rest) days.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className={styles.ghostBtn}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`${styles.btnPrimaryAction} px-6 py-2.5`}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={16} strokeWidth={2.5} />
                  <span>Save Settings</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
  );
}

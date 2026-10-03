"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ChevronRight, GraduationCap, Sparkles, Target, X } from "lucide-react";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";

/**
 * The Planner Modes chooser.
 *
 * Planner Modes sit beside the Classic Planner permanently, so this is a deliberate,
 * compact choice rather than a landing page: three workflows, one line each, in the
 * application's existing dialog pattern. It is a `role="dialog"` with a real label,
 * Escape closes it, focus moves into it on open and returns to the trigger on close —
 * the trigger lives in the Planner header, which is where a student would look.
 *
 * The labels name *workflows*, not difficulty: Exam, Course roadmap and Unit mastery
 * are different kinds of planning, so "Advanced" would be the wrong word for them.
 */

export type PlannerSurfaceMode = "EXAM" | "ROADMAP" | "MASTERY";

const OPTIONS: {
  mode: PlannerSurfaceMode;
  title: string;
  badge: string;
  description: string;
  icon: typeof Target;
  accentStyles: {
    iconBg: string;
    iconBorder: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    hoverBorder: string;
  };
}[] = [
  {
    mode: "EXAM",
    title: "Exam Planner",
    badge: "Day-by-Day Sprint",
    description: "Deadline-driven preparation for one exam, planned day by day.",
    icon: Target,
    accentStyles: {
      iconBg: "bg-violet-500/10",
      iconBorder: "border-violet-500/30",
      iconColor: "text-violet-400",
      badgeBg: "bg-violet-500/10 border-violet-500/25",
      badgeText: "text-violet-300",
      hoverBorder: "hover:border-violet-500/50",
    },
  },
  {
    mode: "ROADMAP",
    title: "Course / Syllabus Roadmap",
    badge: "",
    description: "Strategic long-term planning across months of material and milestones.",
    icon: BookOpen,
    accentStyles: {
      iconBg: "bg-sky-500/10",
      iconBorder: "border-sky-500/30",
      iconColor: "text-sky-400",
      badgeBg: "bg-sky-500/10 border-sky-500/25",
      badgeText: "text-sky-300",
      hoverBorder: "hover:border-sky-500/50",
    },
  },
  {
    mode: "MASTERY",
    title: "Chapter / Unit Mastery",
    badge: "Deep Progression",
    description: "One unit taken through understand, recall, practise, review, then a check.",
    icon: GraduationCap,
    accentStyles: {
      iconBg: "bg-emerald-500/10",
      iconBorder: "border-emerald-500/30",
      iconColor: "text-emerald-400",
      badgeBg: "bg-emerald-500/10 border-emerald-500/25",
      badgeText: "text-emerald-300",
      hoverBorder: "hover:border-emerald-500/50",
    },
  },
];

export default function PlannerModesChooser({
  isOpen,
  onClose,
  onSelect,
  unavailable,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: PlannerSurfaceMode) => void;
  /** True when the account facts could not be loaded, so a mode cannot start. */
  unavailable?: boolean;
}) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);

  // Focus enters the dialog, Escape closes it, and Tab stays inside it while open.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Returning focus to the trigger is part of closing a dialog, not a nicety.
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="planner-modes-chooser"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            ref={dialog}
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="planner-modes-title"
            aria-describedby="planner-modes-note"
            className="relative w-full sm:max-w-lg z-10 flex flex-col rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-hidden bg-[#0d121e]/95 border border-white/10 backdrop-blur-2xl shadow-2xl"
          >
            {/* Ambient top light */}
            <div className="absolute -top-20 -right-20 w-56 h-56 bg-accent-primary/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-accent-primary to-transparent" />

            <div className="relative flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-white/10">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-primary/10 border border-accent-primary/25 text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider text-accent-text-light mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>Specialized Workflows</span>
                </div>
                <h3
                  id="planner-modes-title"
                  className="text-lg sm:text-xl font-bold font-['Rajdhani'] tracking-wide text-text-primary uppercase"
                >
                  Planner modes
                </h3>
                <p id="planner-modes-note" className="text-xs text-text-secondary mt-1 leading-relaxed">
                  Specialized workflows for an exam, a whole course, or one unit. The
                  Classic Planner stays where it is.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close planner modes"
                className="shrink-0 min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-text-secondary hover:text-text-primary hover:bg-white/[0.08] hover:border-white/20 transition-all active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {unavailable && (
              <p role="status" className="px-5 sm:px-6 pt-4 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20 py-2.5">
                Planner modes could not load your schedule facts just now. The Classic
                Planner still works; try again in a moment.
              </p>
            )}

            <ul className="p-3 sm:p-5 flex flex-col gap-2.5 overflow-y-auto chat-scroll relative z-10">
              {OPTIONS.map((option, index) => {
                const Icon = option.icon;
                const { iconBg, iconBorder, iconColor, badgeBg, badgeText, hoverBorder } = option.accentStyles;
                return (
                  <li key={option.mode}>
                    <button
                      ref={index === 0 ? first : undefined}
                      type="button"
                      disabled={unavailable}
                      onClick={() => onSelect(option.mode)}
                      className={`group w-full text-left flex items-center justify-between gap-3 p-3.5 sm:p-4 min-h-11 rounded-xl border border-white/10 bg-white/[0.02] ${hoverBorder} hover:bg-white/[0.05] hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <span
                          className={`shrink-0 p-2.5 rounded-xl ${iconBg} border ${iconBorder} ${iconColor} transition-transform group-hover:scale-105 duration-200 shadow-sm`}
                        >
                          <Icon className="w-5 h-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold font-['Rajdhani'] text-text-primary tracking-wide uppercase">
                              {option.title}
                            </span>
                            {option.badge && (
                              <span
                                className={`text-[10px] font-bold font-['Rajdhani'] uppercase tracking-wider px-2 py-0.5 rounded-full border ${badgeBg} ${badgeText}`}
                              >
                                {option.badge}
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-text-secondary mt-1 leading-relaxed">
                            {option.description}
                          </span>
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary-light group-hover:translate-x-1 transition-all shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

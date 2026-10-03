"use client";

import { useCallback, useEffect, useState } from "react";
import PlannerWorkspace from "../../components/planner/PlannerWorkspace";
import type { PlannerSurfaceMode } from "../../components/planner/PlannerModesChooser";
import { useExamCapabilities } from "../../components/planner/useExamCapabilities";
import { Calendar, LayoutGrid } from "lucide-react";
import AiPlannerPanel, { QuotaInfo } from "../../components/AiPlannerPanel";
import { plannerTelemetry, type PlannerSurface } from "@/lib/planner/telemetry";
import styles from "../System.module.css";

interface PlannerTabProps {
  plannerQuota: QuotaInfo | null;
  sessionId: number | null;
  onQuotaRefresh: () => void;
  /** Called when a plan finishes generating (result carries the thread id). */
  onComplete: (result: any) => void;
  /** Jump into the conversation that received the generated plan. */
  onViewConversation: () => void;
}

/**
 * The Planner as a minimalistic, focused workspace tab.
 *
 * Two planner surfaces coexist here, and the Classic Planner is the default one:
 *
 * - **Classic Planner** — the familiar panel, unchanged, always the first thing shown.
 * - **Planner Modes** — the Exam / Roadmap / Mastery family, reached deliberately from
 *   the header button. Quick Plan stays the default creation flow inside a mode.
 *
 * The view is client state rather than routes, because the System workspace is itself
 * tab state: adding URLs here would be routing complexity with no navigation benefit.
 * The consequence is deliberate and documented: a refresh returns to Classic, and
 * nothing half-persisted is ever shown. Saved Planner Modes plans are reached by
 * entering a mode, exactly as before.
 */
type View = { surface: "CLASSIC" } | { surface: "MODES"; mode?: PlannerSurfaceMode | null };

export default function PlannerTab({
  plannerQuota,
  sessionId,
  onQuotaRefresh,
  onComplete,
  onViewConversation,
}: PlannerTabProps) {
  const capabilities = useExamCapabilities();
  const [view, setView] = useState<View>({ surface: "CLASSIC" });

  // One event per surface actually opened, so Classic and Planner Modes usage can be
  // compared without either being inferred from the other.
  const opened = view.surface;
  useEffect(() => {
    plannerTelemetry("planner_surface_opened", {
      surface: opened as PlannerSurface,
    });
  }, [opened]);

  const enterModes = useCallback((mode: PlannerSurfaceMode | null = null) => {
    plannerTelemetry("planner_surface_opened", { surface: "MODES" });
    if (mode) {
      plannerTelemetry("planner_mode_selected", { mode });
    }
    setView({ surface: "MODES", mode });
  }, []);

  const backToClassic = useCallback(() => {
    plannerTelemetry("planner_returned_to_classic");
    setView({ surface: "CLASSIC" });
  }, []);

  // An unlimited account is never exhausted (`remaining` is deliberately null).
  const quotaExhausted =
    plannerQuota !== null &&
    !plannerQuota.unlimited &&
    (plannerQuota.remaining === 0 || plannerQuota.allowed === false);

  if (view.surface === "MODES") {
    // The mode surface owns its own navigation bar, which carries "← Classic Planner"
    // beside the mode switcher. A second bar here would be two ways to say one thing.
    if (!capabilities)
      return (
        <div className="flex-1 min-h-0 overflow-y-auto chat-scroll p-6">
          <button
            type="button"
            onClick={backToClassic}
            className="min-h-11 inline-flex items-center gap-2 px-3 rounded-xl border border-border-subtle text-sm text-text-secondary hover:text-text-primary hover:bg-bg-shadow/60 transition-colors"
          >
            ← Classic Planner
          </button>
          <p role="status" className="mt-4 text-text-secondary">
            Loading planner modes…
          </p>
        </div>
      );
    return (
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
        <PlannerWorkspace
          capabilities={capabilities}
          initialMode={view.mode ?? undefined}
          onExitToClassic={backToClassic}
          onQuotaRefresh={onQuotaRefresh}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className={styles.plannerCard}>
          {/* Ambient soft glow */}
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-accent-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Minimalist Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-border-subtle relative z-10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-accent-primary/10 border border-accent-primary/30 text-accent-text-light shrink-0 shadow-sm">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold font-['Rajdhani'] text-text-primary tracking-wide truncate">
                  AI Study Planner
                </h2>
                <p className="text-xs text-text-secondary font-['Rajdhani'] truncate">
                  Adaptive syllabus & quest generator
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {plannerQuota && (
                <span
                  className={`text-[10px] uppercase tracking-wider font-mono px-2.5 py-1 rounded-full border ${
                    quotaExhausted ? styles.tabBadgeLocked : styles.tabBadge
                  }`}
                >
                  {plannerQuota.unlimited
                    ? "Unlimited Plans"
                    : `${plannerQuota.used} / ${plannerQuota.limit} Free Weekly Plan`}
                </span>
              )}
              {/* The one deliberate way into the specialized workflows. Navigates directly
                  to Planner Modes (Ask Sylf recommendation + Manual Chooser). */}
              <button
                type="button"
                onClick={() => enterModes(null)}
                className="min-h-11 inline-flex items-center gap-2 px-3 rounded-xl border border-border-subtle text-xs sm:text-sm text-text-secondary hover:text-text-primary hover:border-accent-primary/40 hover:bg-bg-shadow/60 transition-colors"
              >
                <LayoutGrid className="w-4 h-4" />
                Planner modes
              </button>
            </div>
          </div>

          {/* Form / generation / states — the Classic Planner, exactly as it was. */}
          <AiPlannerPanel
            quota={plannerQuota}
            onQuotaRefresh={onQuotaRefresh}
            sessionId={sessionId}
            embedded
            onViewConversation={onViewConversation}
            onComplete={onComplete}
          />
        </div>
      </div>
    </div>
  );
}

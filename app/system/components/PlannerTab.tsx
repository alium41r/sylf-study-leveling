"use client";

import { Calendar, Sparkles, Clock, Target, Layers } from "lucide-react";
import AiPlannerPanel, { QuotaInfo } from "../../components/AiPlannerPanel";

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
 * The Planner as a first-class part of the System workspace.
 * The same engine as the classic modal, rendered inline.
 */
export default function PlannerTab({
  plannerQuota,
  sessionId,
  onQuotaRefresh,
  onComplete,
  onViewConversation,
}: PlannerTabProps) {
  const quotaExhausted =
    plannerQuota !== null && (plannerQuota.remaining === 0 || plannerQuota.allowed === false);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Intro */}
        <div className="system-card rounded-xl p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold font-['Rajdhani'] text-text-primary tracking-wide flex items-center gap-2 flex-wrap">
                AI Study Planner
                <span
                  className={`text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full border ${
                    quotaExhausted
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                      : "bg-bg-abyss border-border-subtle text-text-muted"
                  }`}
                >
                  {plannerQuota ? `${plannerQuota.used} / ${plannerQuota.limit} Free Daily Plan` : "Daily Plan"}
                </span>
              </h2>
              <p className="text-xs text-text-muted font-['Rajdhani'] leading-relaxed mt-1">
                Give The System a subject and it will research an adaptive syllabus, then schedule it
                as quests on your calendar — one comprehensive plan per day on the free tier.
              </p>

              <div className="flex flex-wrap gap-2 mt-4">
                <span className="flex items-center gap-1.5 text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider text-text-secondary bg-bg-abyss/70 border border-border-subtle rounded-full px-2.5 py-1">
                  <Sparkles className="w-3 h-3 text-accent-text-light" />
                  Multi-agent research
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider text-text-secondary bg-bg-abyss/70 border border-border-subtle rounded-full px-2.5 py-1">
                  <Layers className="w-3 h-3 text-accent-text-light" />
                  Adaptive syllabus
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider text-text-secondary bg-bg-abyss/70 border border-border-subtle rounded-full px-2.5 py-1">
                  <Target className="w-3 h-3 text-accent-text-light" />
                  Quest scheduling
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-['Rajdhani'] font-bold uppercase tracking-wider text-text-secondary bg-bg-abyss/70 border border-border-subtle rounded-full px-2.5 py-1">
                  <Clock className="w-3 h-3 text-accent-text-light" />
                  Timezone-aware
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form / generation / states */}
        <div className="system-card rounded-xl p-5 md:p-6">
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

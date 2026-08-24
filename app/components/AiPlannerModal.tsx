"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Sparkles, X } from "lucide-react";
import AiPlannerPanel, { QuotaInfo } from "./AiPlannerPanel";

export type { QuotaInfo } from "./AiPlannerPanel";

interface AiPlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlanCreated?: (plan: any) => void;
  quota?: QuotaInfo | null;
  onQuotaRefresh?: () => void;
  sessionId?: number | null;
}

/**
 * Classic centered modal around the shared AiPlannerPanel.
 * The Planner itself also lives as a tab in the /system workspace.
 */
export function AiPlannerModal({
  isOpen,
  onClose,
  onPlanCreated,
  quota,
  onQuotaRefresh,
  sessionId,
}: AiPlannerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="rounded-2xl w-full max-w-xl overflow-hidden relative shadow-2xl border border-border-subtle bg-bg-panel/95 backdrop-blur-xl max-h-[92dvh] overflow-y-auto chat-scroll"
        >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-primary-dim/20 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="p-5 sm:p-6 flex justify-between items-center border-b border-border-subtle bg-bg-shadow/60 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                    AI Study Planner
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-primary-dim border border-accent-primary-mid/40 text-accent-text-light flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-accent-primary" />
                    <span>Multi-Agent</span>
                  </span>
                  {quota && (
                    <span
                      className={`text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full border ${
                        quota.used >= quota.limit
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                          : "bg-bg-abyss border-border-subtle text-text-muted"
                      }`}
                    >
                      {quota.used} / {quota.limit} Free Weekly Plan
                    </span>
                  )}
                </h2>
                <p className="text-xs text-text-muted font-['Rajdhani']">
                  Generate an adaptive syllabus and scheduled quests powered by AI.
                </p>
              </div>
            </div>

            {/* Always accessible close button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-bg-abyss text-text-muted hover:text-text-primary transition-colors border border-transparent hover:border-border-subtle"
              title="Close Planner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 text-text-primary relative z-10">
            <AiPlannerPanel
              quota={quota}
              onQuotaRefresh={onQuotaRefresh}
              sessionId={sessionId}
              embedded={false}
              onClose={onClose}
              onComplete={(data) => {
                if (onPlanCreated) onPlanCreated(data);
                onClose();
              }}
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default AiPlannerModal;

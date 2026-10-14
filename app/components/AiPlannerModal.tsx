"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { SylvieIcon } from "@/app/components/icons";
import AiPlannerPanel, { QuotaInfo } from "./AiPlannerPanel";
import { backdropVariants, modalDialogVariants } from "@/lib/motion";

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
 *
 * This is always the Classic Planner. The specialized Planner Modes have their own
 * deliberate entry point inside the Planner tab ("Planner modes"), so the quick modal
 * never swaps itself for a different planner behind the student's back.
 */
export function AiPlannerModal({
  isOpen,
  onClose,
  onPlanCreated,
  quota,
  onQuotaRefresh,
  sessionId,
}: AiPlannerModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="ai-planner-modal-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          <motion.div
            variants={modalDialogVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="rounded-2xl w-full max-w-xl overflow-hidden relative shadow-2xl border border-border-subtle bg-bg-panel/95 backdrop-blur-xl max-h-[92dvh] overflow-y-auto chat-scroll z-10"
          >
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-accent-primary-dim/20 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="p-5 sm:p-6 flex justify-between items-center border-b border-border-subtle bg-bg-shadow/60 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent-primary-dim border border-accent-primary-mid text-accent-text-light">
                <SylvieIcon size={20} />
              </div>
              <div>
                <h2 className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl font-bold font-['Rajdhani'] text-text-primary tracking-wide">
                    Sylvie Planner
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-primary-dim border border-accent-primary-mid/40 text-accent-text-light flex items-center gap-1">
                    <SylvieIcon size={12} className="text-accent-primary" />
                    <span>Multi-Agent</span>
                  </span>
                  {quota && (
                    <span
                      className={`text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full border ${
                        !quota.unlimited && quota.used >= (quota.limit ?? 0)
                          ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                          : "bg-bg-abyss border-border-subtle text-text-muted"
                      }`}
                    >
                      {quota.unlimited
                        ? "Unlimited Plans"
                        : `${quota.used} / ${quota.limit} Free Weekly Plan`}
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
      </motion.div>
    )}
  </AnimatePresence>
  );
}

export default AiPlannerModal;

"use client";

import { motion } from "framer-motion";
import { Sparkles, Lock } from "lucide-react";
import { PagePresence } from "./page-presence";
import { QuotaInfo } from "../AiPlannerModal";

interface SystemFabProps {
  presence: PagePresence;
  chatQuota: QuotaInfo | null;
  onClick: () => void;
}

/**
 * The lightweight global access point. Rendered only on pages with a
 * registered PagePresence, anchored above the acoustics island so the
 * two never overlap. Quiet by default — a small glowing pill that opens
 * the quick conversational overlay without leaving the current page.
 */
export default function SystemFab({ presence, chatQuota, onClick }: SystemFabProps) {
  const quotaExhausted = chatQuota !== null && chatQuota.remaining === 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
      onClick={onClick}
      aria-label={`Ask The System — ${presence.label} context`}
      title={`Ask The System — ${presence.label} context`}
      className="fixed z-[58] right-4 sm:right-6 bottom-5 sm:bottom-6 group flex items-center gap-2 rounded-full border border-accent-mid/70 bg-bg-abyss/95 backdrop-blur-xl pl-1.5 pr-1.5 sm:pl-2 sm:pr-2 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45),0_0_22px_var(--accent-primary-dim)] hover:shadow-[0_8px_40px_rgba(0,0,0,0.55),0_0_34px_var(--accent-primary-mid)] hover:border-accent-primary-light transition-all duration-200 hover:scale-[1.03] active:scale-95"
    >
      <span className="w-8 h-8 rounded-full bg-accent-primary/15 border border-accent-mid/50 flex items-center justify-center text-accent-text-light shrink-0">
        <Sparkles className="w-4 h-4" />
      </span>

      <span
        className="hidden sm:block text-[11px] font-bold uppercase tracking-widest font-['Rajdhani'] text-text-primary pr-1"
        style={{ fontFamily: "'Rajdhani', sans-serif" }}
      >
        Ask The System
      </span>

      <span
        className="hidden md:flex items-center text-[9px] uppercase tracking-wider font-['Rajdhani'] text-accent-text-light bg-accent-dim border border-accent-mid/50 rounded-full px-2 py-0.5 mr-0.5"
        style={{ fontFamily: "'Rajdhani', sans-serif" }}
      >
        {presence.label}
      </span>

      {quotaExhausted && (
        <span
          className="hidden sm:flex items-center gap-1 text-[9px] uppercase tracking-wider font-['Rajdhani'] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-full px-2 py-0.5 mr-0.5"
          title="Daily AI quota reached — resets at midnight"
        >
          <Lock className="w-3 h-3" />
          <span>Limit</span>
        </span>
      )}
    </motion.button>
  );
}

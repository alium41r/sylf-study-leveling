"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GoalsTab } from "./components/GoalsTab";
import { QuestsTab } from "./components/QuestsTab";

type ActiveTab = "goals" | "quests";

function UnifiedObjectivesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentTabParam = searchParams.get("tab");
  const activeTab: ActiveTab = currentTabParam === "quests" ? "quests" : "goals";

  const handleTabChange = (newTab: ActiveTab) => {
    if (newTab === activeTab) return;
    router.replace(`/goals?tab=${newTab}`, { scroll: false });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* ─── Top Switcher Bar ──────────────────────────── */}
      <div className="flex justify-center mb-8">
        <div className="bg-bg-panel/70 backdrop-blur-md border border-border-subtle p-1.5 rounded-2xl flex items-center gap-1 shadow-lg">
          {/* Goals Tab Button */}
          <button
            type="button"
            onClick={() => handleTabChange("goals")}
            className={`relative px-8 py-2.5 rounded-xl font-['Rajdhani'] font-bold text-sm tracking-widest uppercase transition-colors duration-200 z-10 flex items-center gap-2 ${
              activeTab === "goals"
                ? "text-accent-primary-light text-shadow-glow"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {activeTab === "goals" && (
              <motion.div
                layoutId="activeObjectivesTabPill"
                className="absolute inset-0 bg-accent-primary-dim border border-accent-primary-mid rounded-xl shadow-[0_0_16px_var(--accent-primary-dim)]"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              GOALS
            </span>
          </button>

          {/* Quests Tab Button */}
          <button
            type="button"
            onClick={() => handleTabChange("quests")}
            className={`relative px-8 py-2.5 rounded-xl font-['Rajdhani'] font-bold text-sm tracking-widest uppercase transition-colors duration-200 z-10 flex items-center gap-2 ${
              activeTab === "quests"
                ? "text-accent-primary-light text-shadow-glow"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {activeTab === "quests" && (
              <motion.div
                layoutId="activeObjectivesTabPill"
                className="absolute inset-0 bg-accent-primary-dim border border-accent-primary-mid rounded-xl shadow-[0_0_16px_var(--accent-primary-dim)]"
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              QUESTS
            </span>
          </button>
        </div>
      </div>

      {/* ─── Tab Content Views with Smooth Crossfade/Slide ─ */}
      <AnimatePresence mode="wait">
        {activeTab === "goals" ? (
          <motion.div
            key="goals-tab"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <GoalsTab />
          </motion.div>
        ) : (
          <motion.div
            key="quests-tab"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <QuestsTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function UnifiedGoalsAndQuestsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted">Loading Objectives...</div>}>
      <UnifiedObjectivesContent />
    </Suspense>
  );
}

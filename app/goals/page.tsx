"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GoalsTab } from "./components/GoalsTab";
import { QuestsTab } from "./components/QuestsTab";
import { SkillTreeTab } from "@/app/locker/components/SkillTreeTab";

type ActiveTab = "goals" | "quests" | "skill-tree";

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "goals",
    label: "GOALS",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "quests",
    label: "QUESTS",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "skill-tree",
    label: "SKILL TREE",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
];

function UnifiedObjectivesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentTabParam = searchParams.get("tab") as ActiveTab;
  const activeTab: ActiveTab =
    currentTabParam && ["goals", "quests", "skill-tree"].includes(currentTabParam)
      ? currentTabParam
      : "goals";

  const handleTabChange = (newTab: ActiveTab) => {
    if (newTab === activeTab) return;
    router.replace(`/goals?tab=${newTab}`, { scroll: false });
  };

  return (
    <div
      className={`w-full max-w-7xl mx-auto px-4 py-6 sm:p-8 min-h-screen ${
        activeTab === "skill-tree" ? "max-w-6xl" : "max-w-7xl"
      }`}
    >
      {/* ─── Top Switcher Bar ──────────────────────────── */}
      <div className="w-full flex mb-8">
        <div className="bg-bg-panel/70 backdrop-blur-md border border-border-subtle p-1.5 rounded-2xl flex items-center justify-center gap-1 shadow-lg max-w-full mx-auto flex-wrap">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`relative px-6 sm:px-8 py-2.5 rounded-xl font-['Rajdhani'] font-bold text-xs sm:text-sm tracking-widest uppercase transition-colors duration-200 z-10 shrink-0 flex items-center gap-2 ${
                  isActive
                    ? "text-accent-primary-light text-shadow-glow"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="activeObjectivesTabPill"
                    className="absolute inset-0 bg-accent-primary-dim border border-accent-primary-mid rounded-xl shadow-[0_0_16px_var(--accent-primary-dim)]"
                    transition={{ type: "spring", stiffness: 450, damping: 32 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {tab.icon}
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Tab Content Views with Smooth Crossfade/Slide ─ */}
      <AnimatePresence mode="wait">
        {activeTab === "goals" && (
          <motion.div
            key="goals-tab"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <GoalsTab />
          </motion.div>
        )}

        {activeTab === "quests" && (
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

        {activeTab === "skill-tree" && (
          <motion.div
            key="skill-tree-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <SkillTreeTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function UnifiedGoalsAndQuestsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted font-['Rajdhani']">Loading Objectives...</div>}>
      <UnifiedObjectivesContent />
    </Suspense>
  );
}

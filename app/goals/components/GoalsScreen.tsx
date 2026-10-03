"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GoalsTab } from "./GoalsTab";
import { QuestsTab } from "./QuestsTab";
import { ObjectiveTargetIcon, QuestEmblemIcon } from "@/app/components/icons";
import styles from "../Goals.module.css";

type ActiveTab = "goals" | "quests";

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "goals",
    label: "GOALS",
    icon: <ObjectiveTargetIcon size={16} />,
  },
  {
    id: "quests",
    label: "QUESTS",
    icon: <QuestEmblemIcon size={16} />,
  },
];

interface GoalsScreenProps {
  initialTab?: ActiveTab;
}

function UnifiedObjectivesContent({ initialTab = "goals" }: GoalsScreenProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentTabParam = searchParams.get("tab") as ActiveTab;
  const activeTab: ActiveTab =
    currentTabParam && ["goals", "quests"].includes(currentTabParam)
      ? currentTabParam
      : initialTab;

  // Gracefully intercept and redirect any skill-tree queries back to goals
  useEffect(() => {
    if (searchParams.get("tab") === "skill-tree") {
      router.replace("/goals?tab=goals", { scroll: false });
    }
  }, [searchParams, router]);

  const handleTabChange = (newTab: ActiveTab) => {
    if (newTab === activeTab) return;
    router.replace(`/goals?tab=${newTab}`, { scroll: false });
  };

  return (
    <div className={styles.goalsContainer}>
      {/* Ambient Starlight Canvas Glow (Synchronized Dark / Light Mode) */}
      <div className={styles.topGlow} aria-hidden="true" />

      <div className="w-full max-w-7xl mx-auto px-4 py-6 sm:p-8 relative z-10">
        {/* ─── Top Switcher Bar ──────────────────────────── */}
        <div className="w-full flex justify-center items-center mb-8">
          <div className={styles.tabSwitcher}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={`relative px-6 sm:px-8 py-2.5 rounded-xl font-['Rajdhani'] font-bold text-xs sm:text-sm tracking-widest uppercase transition-colors duration-200 z-10 shrink-0 flex items-center gap-2 cursor-pointer ${
                    isActive ? "text-accent-text-light" : "hover:opacity-80"
                  }`}
                  style={{
                    color: isActive ? "var(--accent-strong)" : "var(--muted)",
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeObjectivesTabPill"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: "var(--accent-dim)",
                        border: "1px solid var(--accent-mid)",
                        boxShadow: "0 0 16px var(--accent-dim)",
                      }}
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
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function GoalsScreen({ initialTab }: GoalsScreenProps) {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted font-['Rajdhani']">Loading Objectives...</div>}>
      <UnifiedObjectivesContent initialTab={initialTab} />
    </Suspense>
  );
}

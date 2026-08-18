"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IdentityTab } from "./components/IdentityTab";
import { ItemsTab } from "./components/ItemsTab";
import { AcousticsTab } from "./components/AcousticsTab";
import { SkillTreeTab } from "./components/SkillTreeTab";

type LockerTab = "identity" | "items" | "acoustics" | "skill-tree";

const TABS: { id: LockerTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "identity",
    label: "IDENTITY",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    id: "items",
    label: "ITEMS",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    id: "acoustics",
    label: "ACOUSTICS",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    ),
  },
  {
    id: "skill-tree",
    label: "SKILL TREE",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

function LockerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab") as LockerTab;
  const activeTab: LockerTab = (tabParam && ["identity", "items", "acoustics", "skill-tree"].includes(tabParam))
    ? tabParam
    : "identity";

  const handleTabChange = (newTab: LockerTab) => {
    if (newTab === activeTab) return;
    router.replace(`/locker?tab=${newTab}`, { scroll: false });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen">
      {/* ─── Top Switcher Bar ──────────────────────────── */}
      <div className="flex justify-center mb-8">
        <div className="bg-bg-panel/80 backdrop-blur-md border border-border-subtle p-1.5 rounded-2xl flex items-center gap-1 shadow-xl overflow-x-auto max-w-full scrollbar-none">
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
                    layoutId="activeLockerTabPill"
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
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {activeTab === "identity" && <IdentityTab />}
          {activeTab === "items" && <ItemsTab />}
          {activeTab === "acoustics" && <AcousticsTab />}
          {activeTab === "skill-tree" && <SkillTreeTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default function LockerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-text-muted font-['Rajdhani']">Accessing Locker...</div>}>
      <LockerContent />
    </Suspense>
  );
}

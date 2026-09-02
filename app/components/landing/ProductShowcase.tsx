"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProductScreenshot from "./ProductScreenshot";
import {
  Brain,
  Headphones,
  TrendingUp,
  Clock,
  CheckCircle2,
  Play,
  Flame,
  Shield,
  Volume2,
  Sparkles,
  Layers,
} from "lucide-react";

interface WorkflowPillar {
  id: string;
  stepNumber: string;
  title: string;
  shortLabel: string;
  icon: React.ElementType;
  route: string;
  badge: string;
  headline: string;
  description: string;
  features: string[];
}

const PILLARS: WorkflowPillar[] = [
  {
    id: "quests",
    stepNumber: "01",
    title: "Syllabus Breakdown",
    shortLabel: "Quests & Planning",
    icon: Brain,
    route: "sylf.app / quests",
    badge: "Study Planner",
    headline: "Transform overwhelming course outlines into clear daily quests.",
    description:
      "Paste your syllabus or lecture topics. Sylf breaks down the material into prioritized, bite-sized study blocks with realistic focus times and XP rewards so you always know where to begin.",
    features: [
      "Automatic sequencing of dense academic topics",
      "Calibrated time estimates based on difficulty",
      "Immediate conversion into actionable daily tasks",
    ],
  },
  {
    id: "focus",
    stepNumber: "02",
    title: "Deep Focus & Acoustics",
    shortLabel: "Focus Timer",
    icon: Headphones,
    route: "sylf.app / focus",
    badge: "Timer & Audio",
    headline: "Distraction-free timer paired with calibrated ambient acoustics.",
    description:
      "Choose from Free Flow, Pomodoro, or 52/17 study intervals. Layer your session with 40Hz binaural beats, gentle rainfall, or lofi acoustics designed to anchor your concentration.",
    features: [
      "7 flexible study interval modes (Flowtime, Pomodoro, 52/17)",
      "Built-in soundscapes: 40Hz focus tones, rain, library ambience",
      "Full-screen minimal focus mode without visual clutter",
    ],
  },
  {
    id: "progression",
    stepNumber: "03",
    title: "Rank Progression",
    shortLabel: "Progression & Stats",
    icon: TrendingUp,
    route: "sylf.app / progression",
    badge: "8-Tier Ladder",
    headline: "Every focused minute advances your rank and verifies your growth.",
    description:
      "Earn +4 XP per clean minute of study. Progress through 8 rank tiers from Rank E to Monarch, monitor your weekly stamina trends, and use streak shields to protect your consistency sustainably.",
    features: [
      "8-tier rank ladder (Rank E through Monarch)",
      "Weekly stamina and consistency analytics",
      "Scheduled rest days and burnout protection shields",
    ],
  },
];

export default function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<string>("quests");

  const currentPillar = PILLARS.find((p) => p.id === activeTab) || PILLARS[0];

  return (
    <section id="features" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
            <span>Product Workflow</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            How Sylf powers your daily study habit.
          </h2>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            A focused 3-step loop engineered to remove friction, protect deep focus, and make academic work feel visibly rewarding.
          </p>
        </div>

        {/* Interactive Tab Switcher */}
        <div className="flex justify-center mb-8 sm:mb-12">
          <div className="inline-flex p-1 rounded-xl border border-border-subtle bg-bg-abyss shadow-sm max-w-full overflow-x-auto">
            {PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              const isActive = activeTab === pillar.id;

              return (
                <button
                  key={pillar.id}
                  onClick={() => setActiveTab(pillar.id)}
                  className={`flex items-center gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold font-['Rajdhani'] uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-accent-primary text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <span className="font-mono text-[11px] opacity-75">{pillar.stepNumber}</span>
                  <Icon className="w-4 h-4" />
                  <span>{pillar.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPillar.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center max-w-6xl mx-auto"
          >
            {/* Left: Explanatory Copy */}
            <div className="lg:col-span-5 flex flex-col justify-center text-left">
              <div className="flex items-center gap-2 text-xs font-mono text-accent-text-light mb-2 font-semibold">
                <span>PHASE {currentPillar.stepNumber}</span>
                <span>•</span>
                <span>{currentPillar.badge}</span>
              </div>

              <h3
                className="text-2xl sm:text-3xl font-bold text-text-primary mb-3.5 leading-snug"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {currentPillar.headline}
              </h3>

              <p className="text-sm sm:text-base text-text-secondary mb-6 leading-relaxed">
                {currentPillar.description}
              </p>

              <ul className="space-y-2.5">
                {currentPillar.features.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-text-primary">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right: UI Interface Mockup */}
            <div className="lg:col-span-7">
              <ProductScreenshot
                title={currentPillar.route}
                badge={currentPillar.badge}
                alt={currentPillar.headline}
                aspectRatio="auto"
              >
                {currentPillar.id === "quests" && (
                  /* Mock UI 1: Syllabus Quests */
                  <div className="flex flex-col gap-3 text-xs text-left">
                    <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
                      <div>
                        <span className="font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider text-xs">
                          Active Syllabus Quests
                        </span>
                        <p className="text-[10px] text-text-muted font-mono">
                          Subject: Advanced Mathematics & Physics
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light font-mono font-bold">
                        3 Quests Remaining
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 rounded-lg border border-accent-primary-mid/40 bg-accent-primary-dim/15 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-accent-primary text-white flex items-center justify-center shrink-0">
                            <Brain className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-text-primary text-xs truncate font-['Rajdhani']">
                              Multivariable Calculus: Lagrange Multipliers
                            </p>
                            <p className="text-[10px] text-text-muted font-mono">
                              45 min estimated • +180 XP reward
                            </p>
                          </div>
                        </div>
                        <button className="btn-primary px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-['Rajdhani'] flex items-center gap-1 shrink-0">
                          <Play className="w-3 h-3" />
                          <span>Start</span>
                        </button>
                      </div>

                      <div className="p-3 rounded-lg border border-border-subtle bg-bg-void/60 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-bg-abyss border border-border-subtle text-text-muted flex items-center justify-center shrink-0">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-text-primary text-xs truncate font-['Rajdhani']">
                              Electromagnetism: Gauss's Law Applications
                            </p>
                            <p className="text-[10px] text-text-muted font-mono">
                              50 min estimated • +200 XP reward
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-text-muted px-2 py-1 rounded bg-bg-abyss border border-border-subtle">
                          Queued
                        </span>
                      </div>

                      <div className="p-3 rounded-lg border border-border-subtle bg-bg-void/60 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-md bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-text-primary text-xs truncate font-['Rajdhani'] line-through opacity-70">
                              Differential Equations: First-Order Linear
                            </p>
                            <p className="text-[10px] text-emerald-400 font-mono">
                              Completed • +160 XP awarded
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400">Done</span>
                      </div>
                    </div>
                  </div>
                )}

                {currentPillar.id === "focus" && (
                  /* Mock UI 2: Focus Timer & Acoustics */
                  <div className="flex flex-col gap-3.5 text-xs text-left">
                    <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider text-xs">
                          Focus Room
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">
                          52 / 17 Technique
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-text-muted font-mono text-[10px]">
                        <Volume2 className="w-3.5 h-3.5 text-accent-primary-light" />
                        <span>Acoustics Active</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-border-subtle bg-bg-void/80 text-center flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase font-bold text-text-muted font-['Rajdhani'] tracking-widest mb-1">
                        Current Sprint: Quantum States
                      </span>
                      <div className="text-4xl sm:text-5xl font-extrabold font-mono text-text-primary my-2 tracking-tight">
                        38:42
                      </div>
                      <p className="text-[11px] text-accent-text-light font-mono">
                        +154 XP accumulating • Deep Focus Active
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg border border-accent-primary-mid/40 bg-accent-primary-dim/20 text-center">
                        <span className="text-[9px] uppercase font-bold text-text-muted font-['Rajdhani'] block">
                          Soundscape
                        </span>
                        <span className="text-[11px] font-semibold text-accent-text-light truncate block">
                          40Hz Focus Beat
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-void/60 text-center">
                        <span className="text-[9px] uppercase font-bold text-text-muted font-['Rajdhani'] block">
                          Interval Mode
                        </span>
                        <span className="text-[11px] font-semibold text-text-primary truncate block">
                          Sprint 52m
                        </span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-void/60 text-center">
                        <span className="text-[9px] uppercase font-bold text-text-muted font-['Rajdhani'] block">
                          Distraction Guard
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400 truncate block">
                          Enabled
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {currentPillar.id === "progression" && (
                  /* Mock UI 3: Progression & Rank */
                  <div className="flex flex-col gap-3.5 text-xs text-left">
                    <div className="flex items-center justify-between pb-2.5 border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-accent-primary text-white flex items-center justify-center font-bold font-['Rajdhani'] text-xs">
                          B
                        </div>
                        <span className="font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider text-xs">
                          Rank B • Senior Scholar
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/15">
                        14-Day Streak (+20% XP)
                      </span>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] font-['Rajdhani'] font-bold mb-1">
                        <span className="text-text-muted uppercase tracking-wider">Level 54 Progression</span>
                        <span className="text-accent-primary-light font-mono">
                          3,120 / 4,000 XP (78%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-bg-void overflow-hidden border border-border-subtle">
                        <div
                          className="h-full rounded-full bg-accent-primary"
                          style={{ width: "78%" }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-void/60">
                        <div className="flex items-center gap-1.5 text-text-muted text-[10px] font-mono mb-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          <span>WEEKLY FOCUS</span>
                        </div>
                        <p className="text-sm font-bold font-mono text-text-primary">18h 40m</p>
                        <p className="text-[10px] text-text-muted mt-0.5">Top 5% consistency</p>
                      </div>

                      <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-void/60">
                        <div className="flex items-center gap-1.5 text-text-muted text-[10px] font-mono mb-1">
                          <Shield className="w-3 h-3 text-emerald-400" />
                          <span>STREAK SHIELDS</span>
                        </div>
                        <p className="text-sm font-bold font-mono text-emerald-400">2 Protected</p>
                        <p className="text-[10px] text-text-muted mt-0.5">Rest day scheduled</p>
                      </div>
                    </div>
                  </div>
                )}
              </ProductScreenshot>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

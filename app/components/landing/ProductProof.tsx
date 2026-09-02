"use client";

import React from "react";
import { motion } from "framer-motion";
import ProductScreenshot from "./ProductScreenshot";
import { Timer, Brain, TrendingUp, CheckCircle2, Play, Flame, Shield } from "lucide-react";

export default function ProductProof() {
  return (
    <section id="product-proof" className="py-12 sm:py-16 md:py-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12">
          <div
            className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs tracking-[0.2em] uppercase font-bold border"
            style={{
              background: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <span>The Interface</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Your study system, all in one place.
          </h2>

          <p className="text-[15px] sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            From daily syllabus quests and distraction-free timers to weekly consistency tracking.
          </p>
        </div>

        {/* Big Product Showcase Frame */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-5xl mx-auto mb-10 sm:mb-14"
        >
          <ProductScreenshot
            title="Sylf Workspace — Dashboard & Study Loop"
            badge="Live Interface"
            alt="Sylf Study Workspace showing active quests, level progression, and focus timer"
            aspectRatio="16/10"
            caption="The Sylf dashboard unites your curriculum, daily focus targets, and verified XP."
          >
            {/* Authentic Representation of Sylf's Real Dashboard Layout */}
            <div className="w-full h-full flex flex-col justify-between gap-4 text-left">
              {/* Top Bar inside app mockup */}
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent-primary flex items-center justify-center text-white font-bold text-xs font-['Rajdhani']">
                    S
                  </div>
                  <div>
                    <span className="text-xs font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider block">
                      Autonomous Scholar Dashboard
                    </span>
                    <span className="text-[10px] text-text-muted font-mono">
                      Target: MCAT & Organic Chemistry
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>14-Day Streak</span>
                  </span>
                  <span className="px-2 py-0.5 rounded bg-accent-primary-dim text-accent-text-light text-[11px] font-bold">
                    Rank B • Lv. 52
                  </span>
                </div>
              </div>

              {/* Middle Section: Split view of Timer + Today's Quests */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 my-auto">
                {/* Left Mini-Widget: Focus Timer */}
                <div className="md:col-span-5 p-4 rounded-xl border border-border-subtle bg-bg-void/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-text-muted font-['Rajdhani'] tracking-wider">
                      Focus Timer • 52/17 Rhythm
                    </span>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  </div>
                  <div className="text-center py-3">
                    <div className="text-3xl sm:text-4xl font-mono font-bold text-text-primary tracking-tight">
                      34:12
                    </div>
                    <span className="text-[11px] text-accent-primary-light font-mono">
                      Cycle 2 of 3 • Organic Synthesis
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-border-subtle/50 text-[11px] text-text-muted font-mono">
                    <span>Soundscape: 40Hz + Rain</span>
                  </div>
                </div>

                {/* Right Mini-Widget: Today's Quests */}
                <div className="md:col-span-7 p-4 rounded-xl border border-border-subtle bg-bg-void/70 flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-text-muted font-['Rajdhani'] tracking-wider">
                      Today&apos;s Active Quests
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">2 of 3 done</span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-2 rounded-lg bg-bg-abyss border border-border-subtle/70 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-muted line-through">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Carboxylic Acids & Derivatives</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">+120 XP</span>
                    </div>
                    <div className="p-2 rounded-lg bg-bg-abyss border border-border-subtle/70 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-muted line-through">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Thermodynamics Flashcard Drills</span>
                      </span>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">+90 XP</span>
                    </div>
                    <div className="p-2 rounded-lg bg-accent-primary-dim/20 border border-accent-primary-mid/40 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-text-primary font-semibold">
                        <Play className="w-3.5 h-3.5 text-accent-primary" />
                        <span>Reaction Mechanisms Practice Set #2</span>
                      </span>
                      <span className="text-[10px] font-mono text-accent-primary-light font-bold">IN PROGRESS</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Mini-Widget: XP Progress Bar */}
              <div className="pt-2 border-t border-border-subtle">
                <div className="flex justify-between text-[11px] font-mono mb-1">
                  <span className="text-text-muted">Rank B Progression</span>
                  <span className="text-accent-primary-light font-bold">3,850 / 5,000 XP (77%)</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-bg-void border border-border-subtle overflow-hidden">
                  <div className="h-full bg-accent-primary rounded-full" style={{ width: "77%" }} />
                </div>
              </div>
            </div>
          </ProductScreenshot>
        </motion.div>

        {/* 3 Value Pillars Underneath */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/80">
            <div className="w-8 h-8 rounded-lg bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-3">
              <Brain className="w-4 h-4 text-accent-primary-light" />
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1 font-['Rajdhani']">
              Syllabus into Quests
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Add your coursework or exam topics. Sylf breaks them into manageable daily sessions with clear focus times.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/80">
            <div className="w-8 h-8 rounded-lg bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-3">
              <Timer className="w-4 h-4 text-accent-primary-light" />
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1 font-['Rajdhani']">
              Focus Timer & Acoustics
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Study with Pomodoro, 52/17, or Free Flow. Calibrated background audio filters distractions and keeps you in flow.
            </p>
          </div>

          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/80">
            <div className="w-8 h-8 rounded-lg bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-3">
              <TrendingUp className="w-4 h-4 text-accent-primary-light" />
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1 font-['Rajdhani']">
              Visible Progression
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Every completed study hour awards XP and builds your 8-tier rank from Rank E to Monarch.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

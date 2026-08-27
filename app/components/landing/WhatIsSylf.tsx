"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  XCircle,
  CheckCircle2,
  Brain,
  TrendingUp,
  Target,
  Zap,
  Sparkles,
  ArrowRight,
} from "lucide-react";

export default function WhatIsSylf() {
  return (
    <section id="what-is-sylf" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16">
          <div
            className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs tracking-[0.2em] uppercase font-bold border"
            style={{
              background: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>THE AWAKENING</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Why Do Games Feel Rewarding, But Studying Feels Like a Chore?
          </h2>

          <p className="text-[15px] sm:text-lg text-text-secondary leading-relaxed">
            <span className="sm:hidden">Games give instant feedback and visible progression. Sylf brings that same dopamine loop to your coursework.</span>
            <span className="hidden sm:inline">Games give you instant feedback, clear objectives, and visible progression. Standard study apps only give you empty to-do lists and guilt. Sylf bridges the gap by making academic mastery a measurable RPG journey.</span>
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
          {/* Left: Traditional Study Method */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-5 sm:p-8 rounded-2xl border border-red-500/20 bg-bg-abyss relative overflow-hidden"
          >
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className="text-lg sm:text-xl font-bold text-text-primary tracking-wide"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Traditional Study Methods
                </h3>
                <span className="text-xs text-text-muted">Overwhelming, ambiguous, and passive</span>
              </div>
            </div>

            <ul className="space-y-3 sm:space-y-4">
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-secondary">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">500-page textbook overwhelm & decision fatigue</span>
                <span className="hidden sm:inline"><strong>Endless To-Do Lists:</strong> 500-page textbooks without clear daily priorities create decision fatigue.</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-secondary">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Zero visible feedback or tangible sense of progress</span>
                <span className="hidden sm:inline"><strong>Zero Sense of Progress:</strong> You study 4 hours but feel like you made no tangible headway.</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-secondary">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Guilt-inducing broken streaks & procrastination loops</span>
                <span className="hidden sm:inline"><strong>Fragile Motivation:</strong> One missed day breaks generic streaks, inducing guilt and procrastination loops.</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-secondary">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Isolated, unmeasured grind with no mastery indicator</span>
                <span className="hidden sm:inline"><strong>Isolated Effort:</strong> Studying alone in silence with no feedback, progression, or mastery indicators.</span>
              </li>
            </ul>
          </motion.div>

          {/* Right: The Sylf Protocol */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="p-5 sm:p-8 rounded-2xl border border-accent-primary-mid bg-bg-abyss relative overflow-hidden shadow-card"
          >
            <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl bg-accent-primary-dim border-l border-b border-accent-primary-mid text-[10px] uppercase font-bold tracking-widest text-accent-text-light font-['Rajdhani']">
              The System
            </div>

            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3
                  className="text-lg sm:text-xl font-bold text-text-primary tracking-wide"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  The Sylf Progression Loop
                </h3>
                <span className="text-xs text-accent-primary-light">Quantifiable, structured, and rewarding</span>
              </div>
            </div>

            <ul className="space-y-3 sm:space-y-4">
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">AI-dissected daily quests with calibrated focus targets</span>
                <span className="hidden sm:inline"><strong>AI-Generated Quests:</strong> Syllabi are dissected into prioritized, bite-sized daily objectives with target durations.</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Rank E → Monarch ascension with mathematical XP</span>
                <span className="hidden sm:inline"><strong>Mathematical Leveling:</strong> Every focus session awards XP. Level up and ascend from Rank E to Monarch.</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Rest days & streak shields protect your consistency</span>
                <span className="hidden sm:inline"><strong>Cognitive Stat Matrix:</strong> Track measurable stamina (Endurance, Tenacity, Velocity, Discipline, Synthesis).</span>
              </li>
              <li className="flex items-start gap-2.5 text-[13px] sm:text-sm text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="sm:hidden">Deep work Focus Room with 40Hz binaural soundscapes</span>
                <span className="hidden sm:inline"><strong>Focus Room & Acoustics:</strong> Study in an ambient soundscape environment calibrated for deep concentration.</span>
              </li>
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

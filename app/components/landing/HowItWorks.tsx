"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Brain,
  Timer,
  Award,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

const STEPS = [
  {
    step: "01",
    title: "Input Your Curriculum",
    description:
      "Enter your target subject, exam board (e.g. CAIE, AP, IB, University), or paste your lecture topics.",
    icon: FileText,
  },
  {
    step: "02",
    title: "AI Generates Quests",
    description:
      "The system breaks the syllabus into manageable daily quests with calibrated target durations and XP rewards.",
    icon: Brain,
  },
  {
    step: "03",
    title: "Lock In Focus Blocks",
    description:
      "Study in the distraction-free Focus Room with built-in 40Hz binaural acoustics and verified timer sessions.",
    icon: Timer,
  },
  {
    step: "04",
    title: "Level Up & Ascend",
    description:
      "Earn XP, rise from Rank E to Monarch, scale your cognitive stats, and claim earned Sylph currency rewards.",
    icon: Award,
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-20 md:py-28 relative">
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
            <span>THE 4-STEP PROTOCOL</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            How Sylf Works
          </h2>

          <p className="text-[15px] sm:text-lg text-text-secondary leading-relaxed">
            From textbook overwhelm to unambiguous daily progression in four simple steps.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative">
          {STEPS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="p-5 sm:p-6 rounded-2xl border border-border-subtle bg-bg-abyss relative flex flex-col justify-between hover:border-accent-primary-mid transition-all duration-300 shadow-card"
              >
                <div>
                  <div className="flex items-center justify-between mb-4 sm:mb-5">
                    <span
                      className="text-2xl sm:text-3xl font-extrabold text-accent-primary-light font-mono opacity-60"
                      style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                      {item.step}
                    </span>
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light">
                      <Icon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    </div>
                  </div>

                  <h3
                    className="text-base sm:text-lg font-bold text-text-primary mb-2 tracking-wide"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="hidden sm:flex pt-5 mt-5 border-t border-border-subtle/60 items-center gap-1.5 text-xs text-accent-text-light font-semibold font-['Rajdhani'] uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Step Complete</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

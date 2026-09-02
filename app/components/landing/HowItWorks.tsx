"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Timer,
  Award,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const STEPS = [
  {
    step: "01",
    title: "Add what you're studying",
    tagline: "Syllabus or topics",
    description:
      "Enter your subjects, paste your syllabus, or outline your exam topics. Sylf organizes them into manageable, prioritized study chunks.",
    icon: FileText,
  },
  {
    step: "02",
    title: "Study with focus",
    tagline: "Distraction-free sessions",
    description:
      "Start each session with a specific objective. Track clean focus time with our timer, backed by ambient acoustics that keep you in flow.",
    icon: Timer,
  },
  {
    step: "03",
    title: "See real progress",
    tagline: "XP, ranks & streaks",
    description:
      "Every completed study block awards verified XP, builds your 8-tier rank from E to Monarch, and tracks your long-term consistency.",
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
            <span>How it works</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            From syllabus to study momentum in three steps.
          </h2>

          <p className="text-[15px] sm:text-lg text-text-secondary leading-relaxed">
            No complex setup or proprietary jargon. Just an intentional system that turns coursework into daily progress.
          </p>
        </div>

        {/* Steps Grid (3 Columns) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative max-w-6xl mx-auto">
          {STEPS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.12 }}
                className="p-6 sm:p-7 rounded-2xl border border-border-subtle bg-bg-abyss relative flex flex-col justify-between hover:border-accent-primary-mid transition-all duration-300 shadow-card"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <span
                      className="text-3xl sm:text-4xl font-extrabold text-accent-primary-light font-mono opacity-80"
                      style={{ fontFamily: "'Rajdhani', sans-serif" }}
                    >
                      {item.step}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>

                  <span className="text-[11px] uppercase tracking-wider font-bold text-accent-text-light/90 font-['Rajdhani'] block mb-1">
                    {item.tagline}
                  </span>

                  <h3
                    className="text-lg sm:text-xl font-bold text-text-primary mb-2.5 tracking-wide"
                    style={{ fontFamily: "'Rajdhani', sans-serif" }}
                  >
                    {item.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="flex pt-5 mt-5 border-t border-border-subtle/60 items-center gap-1.5 text-xs text-text-muted font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Step {item.step} of 03</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

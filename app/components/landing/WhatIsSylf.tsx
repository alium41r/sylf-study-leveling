"use client";

import React from "react";
import { X, Check } from "lucide-react";

export default function WhatIsSylf() {
  return (
    <section id="why-sylf" className="py-16 sm:py-20 md:py-28 relative">
      <span id="what-is-sylf" className="absolute -top-20" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
            <span>Why Sylf Exists</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Built to end study paralysis and burnout.
          </h2>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            Most students fail to stay consistent not because of a lack of ambition, but because of friction in planning and zero visible feedback.
          </p>
        </div>

        {/* High-Contrast Comparison Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Left: Traditional Friction */}
          <div className="p-6 sm:p-7 rounded-xl border border-border-subtle bg-bg-abyss/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4 text-xs uppercase font-bold tracking-wider text-text-muted font-['Rajdhani']">
                <div className="w-5 h-5 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center font-bold">
                  <X className="w-3 h-3" />
                </div>
                <span>Traditional Studying</span>
              </div>

              <h3 className="text-lg font-bold text-text-primary font-['Rajdhani'] mb-3">
                High friction, ambiguous goals, fragile streaks.
              </h3>

              <ul className="space-y-3.5 text-xs sm:text-sm text-text-secondary">
                <li className="flex items-start gap-2.5">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span><strong>Starting Friction:</strong> Wasting the first 20 minutes wondering what topic to tackle next.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span><strong>Syllabus Paralysis:</strong> Hundreds of pages of coursework without clear, daily milestones.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span><strong>All-or-Nothing Guilt:</strong> Missing a single study day wipes out rigid streaks and causes abandonment.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <X className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span><strong>Invisible Growth:</strong> Hours spent studying with no immediate sense of tangible advancement.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right: The Sylf Loop */}
          <div className="p-6 sm:p-7 rounded-xl border border-accent-primary-mid/60 bg-bg-abyss shadow-sm flex flex-col justify-between relative">
            <div>
              <div className="flex items-center gap-2 mb-4 text-xs uppercase font-bold tracking-wider text-accent-text-light font-['Rajdhani']">
                <div className="w-5 h-5 rounded-full bg-accent-primary-dim text-accent-text-light flex items-center justify-center font-bold">
                  <Check className="w-3 h-3" />
                </div>
                <span>The Sylf Study Loop</span>
              </div>

              <h3 className="text-lg font-bold text-text-primary font-['Rajdhani'] mb-3">
                Clear daily quests, deep focus, verifiable growth.
              </h3>

              <ul className="space-y-3.5 text-xs sm:text-sm text-text-primary">
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Instant Clarity:</strong> Open your workspace and immediately launch your top-priority study quest.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Sequenced Sprints:</strong> Dense material structured into realistic 30-60 min focus blocks.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Sustainable Habits:</strong> Scheduled rest days and streak shields designed to prevent burnout.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Visible Progression:</strong> Verified focus hours converted into XP, levels, and an 8-tier rank ladder.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

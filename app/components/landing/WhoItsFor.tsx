"use client";

import React from "react";
import { BookOpen, Compass, ShieldCheck, Trophy, Sparkles } from "lucide-react";

const PROFILES = [
  {
    title: "Dense, Demanding Coursework",
    tagline: "STEM, Medicine, Law & AP / IB / A-Levels",
    description:
      "When your syllabus has 50 topics and 800 pages of reading, you can't rely on random to-do lists. Sylf organizes the entire mountain into daily, achievable focus quests.",
    icon: BookOpen,
  },
  {
    title: "Ending Study Paralysis",
    tagline: "Knowing exactly what to work on next",
    description:
      "Avoid spending the first 20 minutes of study wondering where to begin. Open Sylf, see your highest-priority quest for the day, and start your timer in one click.",
    icon: Compass,
  },
  {
    title: "Sustainable Long-Term Consistency",
    tagline: "No more all-or-nothing guilt",
    description:
      "Rigid daily streaks cause burnout. Sylf includes customizable weekly minute goals, scheduled rest days, and streak shields so an unexpected emergency never wipes out your record.",
    icon: ShieldCheck,
  },
  {
    title: "Visual, Motivating Progression",
    tagline: "Work that feels genuinely rewarding",
    description:
      "Studying shouldn't feel like sending effort into a void. Every completed session earns XP, builds your 8-tier rank, and lets you look back on verified hours of honest work.",
    icon: Trophy,
  },
];

export default function WhoItsFor() {
  return (
    <section className="py-16 sm:py-20 md:py-28 relative">
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
            <span>Who it&apos;s for</span>
          </div>

          <h2
            className="text-[26px] leading-tight sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-3 sm:mb-4 tracking-tight text-balance"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Built for students who want more than a timer.
          </h2>

          <p className="text-[15px] sm:text-lg text-text-secondary leading-relaxed">
            Sylf was built for students who are serious about their academics, but tired of generic pomodoro timers and unorganized notes.
          </p>
        </div>

        {/* Profiles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {PROFILES.map((profile, i) => {
            const Icon = profile.icon;

            return (
              <div
                key={i}
                className="p-6 sm:p-7 rounded-2xl border border-border-subtle bg-bg-abyss shadow-card flex flex-col justify-between hover:border-border-active transition-all"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-bold text-text-primary tracking-wide font-['Rajdhani']"
                      >
                        {profile.title}
                      </h3>
                      <span className="text-xs text-accent-primary-light font-mono">
                        {profile.tagline}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                    {profile.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

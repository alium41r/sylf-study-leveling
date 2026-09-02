"use client";

import React from "react";
import {
  TrendingUp,
  Shield,
  Zap,
  Flame,
  Clock,
  Award,
} from "lucide-react";

const RANKS = [
  { tier: "E", name: "Rank E", level: "Lv. 1+", color: "#94a3b8", desc: "Foundation & Setup" },
  { tier: "D", name: "Rank D", level: "Lv. 10+", color: "#34d399", desc: "Daily Study Rhythm" },
  { tier: "C", name: "Rank C", level: "Lv. 25+", color: "#60a5fa", desc: "Consistent Work" },
  { tier: "B", name: "Rank B", level: "Lv. 50+", color: "#a855f7", desc: "Deep Study Habit" },
  { tier: "A", name: "Rank A", level: "Lv. 75+", color: "#f59e0b", desc: "Academic Stamina" },
  { tier: "S", name: "Rank S", level: "Lv. 100+", color: "#ef4444", desc: "Elite Focus" },
  { tier: "N", name: "National", level: "Lv. 125+", color: "#818cf8", desc: "Peak Discipline" },
  { tier: "M", name: "Monarch", level: "Lv. 150+", color: "#eab308", desc: "The Apex Scholar" },
];

export default function ProgressionSection() {
  return (
    <section id="progression" className="py-16 sm:py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase font-['Rajdhani'] border border-border-subtle bg-bg-abyss/80 text-text-secondary">
            <span>Progression System</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Real study time. Honest progression.
          </h2>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto">
            No fictional rules or artificial shortcuts. Your rank on Sylf is a direct reflection of verifiable hours spent studying.
          </p>
        </div>

        {/* 3-Part Mechanism Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto mb-10 sm:mb-12">
          {/* Card 1: Honest XP */}
          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/90 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-text-muted mb-3">
                <span>01. INPUT</span>
                <Clock className="w-4 h-4 text-accent-primary-light" />
              </div>
              <h3 className="text-base font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider mb-1.5">
                +4 XP Per Focused Minute
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                XP is tied strictly to verified timer sessions. No inflated bonuses or idle farming.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border-subtle/60 text-[11px] font-mono text-text-muted">
              100% verified session time
            </div>
          </div>

          {/* Card 2: Level Scaling */}
          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/90 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-text-muted mb-3">
                <span>02. MILESTONES</span>
                <Zap className="w-4 h-4 text-accent-primary-light" />
              </div>
              <h3 className="text-base font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider mb-1.5">
                Progressive Leveling
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Accumulated XP advances your scholar level, unlocking new milestones and cosmetic titles.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border-subtle/60 text-[11px] font-mono text-text-muted">
              Calibrated exponential scaling
            </div>
          </div>

          {/* Card 3: Consistency & Shields */}
          <div className="p-5 rounded-xl border border-border-subtle bg-bg-abyss/90 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-text-muted mb-3">
                <span>03. SUSTAINABILITY</span>
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <h3 className="text-base font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider mb-1.5">
                Rest Days & Streak Shields
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                Schedule rest days in your calendar and earn shields to protect against burnout and broken streaks.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-border-subtle/60 text-[11px] font-mono text-emerald-400">
              Built for long-term consistency
            </div>
          </div>
        </div>

        {/* 8-Tier Ladder Display */}
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-6">
            <h3 className="text-base sm:text-lg font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider">
              The 8 Scholar Rank Tiers
            </h3>
            <p className="text-xs text-text-muted font-mono mt-0.5">
              Climb from Rank E to Monarch as your study hours accumulate.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-center">
            {RANKS.map((rank) => (
              <div
                key={rank.tier}
                className="p-3 rounded-xl border bg-bg-abyss/80 hover:bg-bg-abyss transition-colors"
                style={{ borderColor: `${rank.color}25` }}
              >
                <div
                  className="w-7 h-7 rounded-lg mx-auto flex items-center justify-center font-bold text-xs font-['Rajdhani'] mb-2"
                  style={{
                    backgroundColor: `${rank.color}18`,
                    color: rank.color,
                    border: `1px solid ${rank.color}40`,
                  }}
                >
                  {rank.tier}
                </div>
                <h4 className="text-xs font-bold text-text-primary font-['Rajdhani'] uppercase tracking-wider">
                  {rank.name}
                </h4>
                <span className="text-[10px] text-text-muted font-mono block">
                  {rank.level}
                </span>
                <p className="text-[10px] text-text-secondary mt-1 leading-tight">
                  {rank.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

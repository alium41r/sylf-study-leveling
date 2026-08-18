"use client";

import React from "react";
import { GitFork, Lock } from "lucide-react";

export function SkillTreeTab() {
  return (
    <div className="system-card rounded-2xl bg-bg-panel/70 border border-white/10 shadow-2xl backdrop-blur-xl p-8 sm:p-16 relative overflow-hidden flex flex-col items-center text-center gap-6 min-h-[420px] justify-center">
      {/* Top Ambient Glow */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />
      <div className="absolute w-72 h-72 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none -top-10" />

      {/* Main Glowing Icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.25)]">
          <GitFork className="w-10 h-10" />
        </div>
        <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-bg-abyss border border-white/10 text-amber-400 shadow-md">
          <Lock className="w-4 h-4" />
        </div>
      </div>

      {/* Text Hierarchy */}
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold font-['Rajdhani'] text-text-primary tracking-wider uppercase">
          Coming Soon
        </h2>
        <span className="text-xs font-bold font-['Rajdhani'] uppercase tracking-widest text-cyan-300 px-3.5 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 inline-block">
          Skill Tree & Masteries
        </span>
      </div>
    </div>
  );
}

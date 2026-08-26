"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TrendingUp,
  Headphones,
  Calendar,
  Layers,
  Sparkles,
  Timer,
  CheckCircle2,
  Flame,
  CloudRain,
  ShieldCheck,
  UserCheck,
  Users,
  Trophy,
  User,
  Radio,
  Clock,
} from "lucide-react";

interface FeaturePillar {
  id: string;
  title: string;
  badge: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  highlights: string[];
  mockup: {
    type: "quests" | "ranks" | "focus" | "stats" | "character" | "social" | "schedule";
  };
}

const FEATURE_PILLARS: FeaturePillar[] = [
  {
    id: "ai-quests",
    title: "AI Quest Master",
    badge: "AI Syllabus Dissection",
    tagline: "Your curriculum broken down into actionable daily quests.",
    description:
      "Paste your syllabus or lecture topics. The AI breaks them into prioritized daily quests with target focus durations, difficulty ratings, and guaranteed XP rewards.",
    icon: Brain,
    highlights: [
      "Auto-generates daily study missions from raw syllabus notes",
      "Adaptive difficulty matching your personal study velocity",
      "XP and rewards granted on verified session completion",
    ],
    mockup: { type: "quests" },
  },
  {
    id: "ranks-leveling",
    title: "8-Tier Rank Progression",
    badge: "E → Monarch Ladder",
    tagline: "Every hour of study counts towards your next rank.",
    description:
      "Climb the 8-tier rank ladder (E, D, C, B, A, S, National, and Monarch). XP requirements scale with your level so high ranks reflect real academic dedication.",
    icon: TrendingUp,
    highlights: [
      "Rigorous mathematical XP progression curve",
      "Rank ascension unlocks new titles and system privileges",
      "Weekly streak multipliers reward unbroken consistency",
    ],
    mockup: { type: "ranks" },
  },
  {
    id: "focus-acoustics",
    title: "Focus Room & Acoustics",
    badge: "Deep Work Engine",
    tagline: "Zero distraction study timer with built-in ambient soundscapes.",
    description:
      "Track clean study sessions with Pomodoro or stopwatch modes. Drop into deep concentration with ambient soundscapes like Night Campfire, Rain on Window, Forest Wind, and Deep Brown Noise.",
    icon: Headphones,
    highlights: [
      "Night Campfire, Rain on Window, Forest Wind, and Deep Brown Noise",
      "Light-mode eye-comfort dimming overlay to reduce glare",
      "Accurate visibility-based study tracking with break guards",
    ],
    mockup: { type: "focus" },
  },
  {
    id: "stats-matrix",
    title: "Cognitive Stats Matrix",
    badge: "5 Core Attributes",
    tagline: "Measure your real academic stamina and velocity.",
    description:
      "Watch your stats evolve as you study: Endurance (long sessions), Tenacity (streak resilience), Velocity (quest throughput), Discipline (consistency), and Synthesis.",
    icon: Layers,
    highlights: [
      "Endurance, Tenacity, Velocity, Discipline, and Synthesis",
      "Live telemetry radar reflecting your genuine study habits",
      "Highlights study bottlenecks and consistency trends",
    ],
    mockup: { type: "stats" },
  },
  {
    id: "character-studio",
    title: "Character & Profile Studio",
    badge: "Scholar Identity",
    tagline: "Customize your character and profile for yourself and others to see.",
    description:
      "Personalize your scholar dossier with 3D avatars, custom titles, banners, pedestals, and auras to showcase your academic milestones and verified study statistics.",
    icon: User,
    highlights: [
      "Customize avatar, profile banner, titles, and holographic auras",
      "Public scholar dossier displaying verified study hours & rank",
      "Visual progression reflecting your real study achievements",
    ],
    mockup: { type: "character" },
  },
  {
    id: "social-leaderboards",
    title: "Socials & Leaderboards",
    badge: "Academic Community",
    tagline: "Connect with study partners, track presence, and climb rankings.",
    description:
      "Study alongside friends with real-time presence indicators, send instant co-study session invites, and compare weekly focus hours on global and friend leaderboards.",
    icon: Users,
    highlights: [
      "Live presence indicators showing friends in active study sessions",
      "Direct co-study invites to focus together in real-time",
      "Global and friend rankings based on verified focus time & XP",
    ],
    mockup: { type: "social" },
  },
  {
    id: "study-schedule",
    title: "Study Schedule & Calendar",
    badge: "Consistency Engine",
    tagline: "Structured planning with streak maintenance and designated rest days.",
    description:
      "Map out your weekly study goals, schedule sessions ahead of time, and designate rest days so unplanned life events don't break your momentum.",
    icon: Calendar,
    highlights: [
      "Customizable daily study target minutes",
      "Designated rest days & weekly streak shields",
      "Automatic quest rescheduling for postponed sessions",
    ],
    mockup: { type: "schedule" },
  },
];

export default function CoreFeatures() {
  const [activeTab, setActiveTab] = useState<string>("ai-quests");

  const currentFeature =
    FEATURE_PILLARS.find((p) => p.id === activeTab) || FEATURE_PILLARS[0];

  return (
    <section id="features" className="py-20 md:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
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
            <span>CORE SYSTEM CAPABILITIES</span>
          </div>

          <h2
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary mb-4 tracking-tight"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            Built For Real Study Sessions, Not Gimmicks
          </h2>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
            Every feature in Sylf is designed around real cognitive science and genuine academic progression.
          </p>
        </div>

        {/* Feature Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 no-scrollbar justify-start lg:justify-center">
          {FEATURE_PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            const isActive = activeTab === pillar.id;

            return (
              <button
                key={pillar.id}
                onClick={() => setActiveTab(pillar.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Rajdhani'] uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border ${
                  isActive
                    ? "bg-accent-primary text-white border-accent-primary shadow-lg"
                    : "bg-bg-abyss text-text-secondary border-border-subtle hover:border-border-active hover:text-text-primary"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{pillar.title}</span>
              </button>
            );
          })}
        </div>

        {/* Active Feature Showcase Box */}
        <div className="p-6 sm:p-10 rounded-2xl border border-border-subtle bg-bg-abyss shadow-card">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Feature Copy */}
            <div className="lg:col-span-6 flex flex-col items-start text-left">
              <span className="text-xs uppercase font-bold tracking-widest text-accent-text-light font-['Rajdhani'] mb-2">
                {currentFeature.badge}
              </span>

              <h3
                className="text-2xl sm:text-3xl font-extrabold text-text-primary mb-3"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {currentFeature.tagline}
              </h3>

              <p className="text-sm sm:text-base text-text-secondary leading-relaxed mb-6">
                {currentFeature.description}
              </p>

              <div className="space-y-3 w-full mb-6">
                {currentFeature.highlights.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-text-primary">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Mockup Preview */}
            <div className="lg:col-span-6">
              <FeatureMockup type={currentFeature.mockup.type} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureMockup({ type }: { type: FeaturePillar["mockup"]["type"] }) {
  if (type === "quests") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3 font-mono">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs">
          <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
            AI QUEST DISSECTION • 9709 MATH
          </span>
          <span className="text-[10px] text-text-muted">3 Daily Quests</span>
        </div>

        <div className="p-3 rounded-lg border border-accent-primary/40 bg-accent-primary-dim/15 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-text-primary font-['Rajdhani']">
              1. Integration by Parts: Drill Set A
            </p>
            <p className="text-[10px] text-text-muted">45 mins • +180 XP</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
            READY
          </span>
        </div>

        <div className="p-3 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-text-primary font-['Rajdhani']">
              2. Vector Planes & Geometry
            </p>
            <p className="text-[10px] text-text-muted">60 mins • +240 XP</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
            QUEUED
          </span>
        </div>

        <div className="p-3 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-text-primary font-['Rajdhani']">
              3. Differential Equations Past Paper
            </p>
            <p className="text-[10px] text-text-muted">50 mins • +200 XP</p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold">
            QUEUED
          </span>
        </div>
      </div>
    );
  }

  if (type === "ranks") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3 font-mono">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs">
          <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
            8-TIER PROGRESSION LADDER
          </span>
          <span className="text-[10px] text-text-muted">Lv. 1 → 150+</span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center text-xs font-['Rajdhani'] font-bold">
          <div className="p-2.5 rounded-lg border border-border-subtle bg-bg-abyss">
            <span className="text-zinc-400 text-sm block">E-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 1+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <span className="text-emerald-400 text-sm block">D-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 10+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10">
            <span className="text-blue-400 text-sm block">C-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 25+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10">
            <span className="text-purple-400 text-sm block">B-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 50+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <span className="text-amber-400 text-sm block">A-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 75+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10">
            <span className="text-red-400 text-sm block">S-Rank</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 100+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10">
            <span className="text-indigo-400 text-sm block">National</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 125+</span>
          </div>
          <div className="p-2.5 rounded-lg border border-yellow-500/50 bg-yellow-500/15 shadow-[0_0_12px_rgba(234,179,8,0.2)]">
            <span className="text-yellow-400 text-sm block">Monarch</span>
            <span className="text-[10px] text-text-muted font-mono">Lv. 150+</span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "focus") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3 font-mono">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs">
          <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
            FOCUS ROOM & ACOUSTICS
          </span>
          <span className="text-[10px] text-emerald-400 font-bold">SESSION LIVE</span>
        </div>

        <div className="p-6 rounded-xl border border-accent-primary-mid/40 bg-bg-abyss text-center">
          <span className="text-4xl font-bold tracking-wider text-text-primary font-mono block mb-1">
            42:18
          </span>
          <span className="text-xs text-text-muted font-['Rajdhani'] uppercase tracking-widest">
            Deep Focus Block • Pure Math
          </span>

          <div className="mt-4 pt-3 border-t border-border-subtle flex flex-col sm:flex-row justify-between items-center gap-2 text-[11px] text-text-secondary">
            <span className="flex items-center gap-1.5 text-amber-300">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>Night Campfire</span>
            </span>
            <span className="flex items-center gap-1.5 text-cyan-300">
              <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rain on Window</span>
            </span>
            <span className="text-accent-primary-light font-semibold">
              Eye-Comfort Active
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (type === "stats") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs font-['Rajdhani']">
          <span className="text-accent-primary-light font-bold uppercase tracking-wider">
            COGNITIVE ATTRIBUTES
          </span>
          <span className="text-[10px] text-text-muted font-mono">5 Dimensions</span>
        </div>

        <div className="space-y-2 text-xs font-['Rajdhani']">
          <div>
            <div className="flex justify-between font-bold mb-1">
              <span className="text-text-secondary">ENDURANCE (Focus Stamina &gt;60m)</span>
              <span className="font-mono text-text-primary">62 / 100</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-shadow overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: "62%" }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-bold mb-1">
              <span className="text-text-secondary">TENACITY (Streak Stability)</span>
              <span className="font-mono text-emerald-400">85 / 100</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-shadow overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: "85%" }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between font-bold mb-1">
              <span className="text-text-secondary">VELOCITY (Daily Quest Throughput)</span>
              <span className="font-mono text-purple-400">74 / 100</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-shadow overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full" style={{ width: "74%" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === "character") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs font-['Rajdhani']">
          <span className="text-accent-primary-light font-bold uppercase tracking-wider">
            SCHOLAR PROFILE DOSSIER
          </span>
          <span className="text-[10px] text-text-muted font-mono">Rank B • Lv. 52</span>
        </div>

        {/* Profile Card Mockup */}
        <div className="p-4 rounded-xl border border-border-subtle bg-bg-abyss space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light font-['Rajdhani'] font-bold text-lg">
              B
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-text-primary font-['Rajdhani']">
                  Alex V.
                </p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary-dim text-accent-text-light font-mono font-bold">
                  Lv. 52
                </span>
              </div>
              <p className="text-[11px] text-accent-primary-light font-['Rajdhani'] font-semibold">
                Title: Master of Calculus
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-border-subtle/60 grid grid-cols-3 gap-2 text-center text-xs font-['Rajdhani']">
            <div className="p-1.5 rounded bg-bg-void/50 border border-border-subtle/40">
              <span className="text-[9px] text-text-muted uppercase block">Total Study</span>
              <span className="font-bold text-text-primary font-mono text-[11px]">184 hrs</span>
            </div>
            <div className="p-1.5 rounded bg-bg-void/50 border border-border-subtle/40">
              <span className="text-[9px] text-text-muted uppercase block">Streak</span>
              <span className="font-bold text-emerald-400 font-mono text-[11px]">28 Days</span>
            </div>
            <div className="p-1.5 rounded bg-bg-void/50 border border-border-subtle/40">
              <span className="text-[9px] text-text-muted uppercase block">Aura</span>
              <span className="font-bold text-purple-400 font-mono text-[11px]">Cyber Glow</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === "social") {
    return (
      <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3 font-mono">
        <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs">
          <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
            COMMUNITY & LEADERBOARD
          </span>
          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>LIVE SESSIONS</span>
          </span>
        </div>

        {/* Friend 1 */}
        <div className="p-3 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-['Rajdhani'] font-bold text-xs flex items-center justify-center shrink-0">
              #1
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary truncate font-['Rajdhani']">
                Elena R. (A-Rank)
              </p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Focusing: Biochemistry (32m)</span>
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-accent-text-light font-mono shrink-0">
            18.4h / wk
          </span>
        </div>

        {/* Friend 2 */}
        <div className="p-3 rounded-lg border border-border-subtle bg-bg-abyss flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 font-['Rajdhani'] font-bold text-xs flex items-center justify-center shrink-0">
              #2
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary truncate font-['Rajdhani']">
                Marcus K. (B-Rank)
              </p>
              <p className="text-[10px] text-text-muted flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                <span>Last active 15m ago</span>
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-text-secondary font-mono shrink-0">
            14.2h / wk
          </span>
        </div>
      </div>
    );
  }

  // schedule
  return (
    <div className="p-5 rounded-xl border border-border-subtle bg-bg-void/80 space-y-3 font-mono">
      <div className="flex justify-between items-center pb-2 border-b border-border-subtle text-xs">
        <span className="text-accent-primary-light font-bold font-['Rajdhani'] uppercase tracking-wider">
          STUDY SCHEDULE & STREAKS
        </span>
        <span className="text-[10px] text-emerald-400 font-bold">14 DAY STREAK</span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
          <div
            key={i}
            className={`p-2 rounded-lg border flex flex-col items-center justify-center gap-1 ${
              i === 5
                ? "border-accent-primary/40 bg-accent-primary-dim/20"
                : i === 6
                ? "border-border-subtle bg-bg-abyss opacity-50"
                : "border-emerald-500/30 bg-emerald-500/10"
            }`}
          >
            <span className="text-[10px] text-text-muted font-bold font-['Rajdhani']">{day}</span>
            <span className="text-[11px] font-bold text-text-primary">
              {i === 6 ? "Rest" : `${120 - i * 10}m`}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-border-subtle flex justify-between text-[11px] text-text-secondary font-['Rajdhani']">
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Rest Day Shield Active</span>
        </span>
        <span className="text-text-muted">Target: 120m / day</span>
      </div>
    </div>
  );
}

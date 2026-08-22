"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./components/AuthProvider";
import { motion } from "framer-motion";
import { Sparkles, Bot, TrendingUp, Zap, Timer } from "lucide-react";

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/dashboard");
    }
  }, [user, isLoading, router]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden py-16 px-4"
      style={{ backgroundColor: "var(--bg-void)", color: "var(--text-primary)" }}
    >
      {/* ─── Background Manhwa Graphic (Subtle in Dark, Disabled/Blended in Light) ──────────── */}
      <div 
        className="absolute inset-0 z-0 opacity-15 dark:opacity-20 pointer-events-none mix-blend-luminosity"
        style={{
          backgroundImage: 'url("https://i.pinimg.com/originals/8a/cc/14/8acc140cc536cce333b288ef39678c18.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      
      {/* ─── Background Overlays (Dynamic Void & Theme Glow) ────────── */}
      <div className="absolute inset-0 bg-bg-void/85 z-0 pointer-events-none" />
      <div className="absolute inset-0 bg-accent-primary-dim mix-blend-overlay z-0 pointer-events-none" />

      {/* ─── Dynamic Radial Glows ──────────────────────── */}
      <div
        className="absolute inset-0 opacity-40 z-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 25%, var(--accent-primary-dim) 0%, transparent 65%), radial-gradient(ellipse at 80% 75%, var(--accent-primary-dim) 0%, transparent 55%)",
        }}
      />

      {/* ─── Animated Grid Mesh ──────────────────────── */}
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.07] z-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      {/* ─── Main Hero Content ────────────────────────────── */}
      <div className="relative z-10 text-center px-4 w-full max-w-7xl mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="max-w-3xl mx-auto flex flex-col items-center"
        >
          {/* System Notification Label */}
          <div
            className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-xs tracking-[0.25em] uppercase font-bold border shadow-sm backdrop-blur-md"
            style={{
              background: "var(--accent-primary-dim)",
              borderColor: "var(--accent-primary-mid)",
              color: "var(--accent-text-light)",
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>SYSTEM NOTIFICATION</span>
          </div>

          {/* Primary Hero Headline: SYLF Container */}
          <div
            className="mb-6 px-8 sm:px-12 md:px-16 py-3 sm:py-5 md:py-6 rounded-2xl sm:rounded-3xl border border-border-subtle/80 bg-bg-abyss/40 backdrop-blur-md animate-glow flex items-center justify-center shadow-lg"
          >
            <h1
              className="text-7xl sm:text-8xl md:text-9xl font-extrabold tracking-wider select-none"
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                background: "linear-gradient(135deg, var(--text-primary) 15%, var(--accent-primary) 60%, var(--accent-primary-light) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                lineHeight: 1.1,
                filter: "drop-shadow(0 0 25px var(--accent-primary-dim))",
              }}
            >
              SYLF
            </h1>
          </div>

          {/* Subtitle / Tagline: STUDY LEVELING */}
          <h2
            className="text-xl sm:text-2xl md:text-3xl font-bold tracking-[0.35em] uppercase mb-4"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              color: "var(--accent-text-light)",
            }}
          >
            STUDY LEVELING
          </h2>

          {/* System Tagline & Description */}
          <p
            className="text-sm sm:text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)", fontFamily: "'Rajdhani', sans-serif" }}
          >
            Every hour you study, you level up. Complete AI quests. Gain experience.
            Rise through the Scholar ranks. The System is watching.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md">
            <Link href="/login" className="w-full sm:w-auto">
              <button className="btn-primary w-full sm:w-auto text-base sm:text-lg px-8 py-3.5 shadow-lg tracking-wider">
                LOGIN
              </button>
            </Link>
            <Link href="/register?force=true" className="w-full sm:w-auto">
              <button className="btn-secondary w-full sm:w-auto text-base sm:text-lg px-8 py-3.5 tracking-wider">
                CREATE ACCOUNT
              </button>
            </Link>
          </div>
        </motion.div>

        {/* ─── Feature Cards Deck ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-16 sm:mt-20 w-full"
        >
          {/* Card 1: AI Quest Master */}
          <div
            className="system-card p-6 text-left rounded-2xl border transition-all duration-300 hover:scale-[1.02] shadow-card"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-4 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <h3
              className="text-base font-bold mb-2 tracking-wide uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-text-light)" }}
            >
              AI QUEST MASTER
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              AI breaks your curriculum into daily quests, giving you an unambiguous path forward.
            </p>
          </div>

          {/* Card 2: Level & Rank Up */}
          <div
            className="system-card p-6 text-left rounded-2xl border transition-all duration-300 hover:scale-[1.02] shadow-card"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-4 shadow-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3
              className="text-base font-bold mb-2 tracking-wide uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-text-light)" }}
            >
              LEVEL & RANK UP
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Earn XP every minute you study. Climb the Scholar ranks from E-Rank to National Rank.
            </p>
          </div>

          {/* Card 3: Adaptive Difficulty */}
          <div
            className="system-card p-6 text-left rounded-2xl border transition-all duration-300 hover:scale-[1.02] shadow-card"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-4 shadow-sm">
              <Zap className="w-5 h-5" />
            </div>
            <h3
              className="text-base font-bold mb-2 tracking-wide uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-text-light)" }}
            >
              ADAPTIVE DIFFICULTY
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The system adapts quest workloads to your personal focus velocity to maintain flow.
            </p>
          </div>

          {/* Card 4: Study Timer */}
          <div
            className="system-card p-6 text-left rounded-2xl border transition-all duration-300 hover:scale-[1.02] shadow-card"
            style={{
              background: "var(--bg-abyss)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-primary-dim border border-accent-primary-mid flex items-center justify-center text-accent-text-light mb-4 shadow-sm">
              <Timer className="w-5 h-5" />
            </div>
            <h3
              className="text-base font-bold mb-2 tracking-wide uppercase"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-text-light)" }}
            >
              STUDY TIMER
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Pomodoro, stopwatch, and automatic session tracking seamlessly integrated into your quests.
            </p>
          </div>
        </motion.div>
      </div>

      {/* ─── Bottom Ambient Fade ──────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          background: "linear-gradient(transparent, var(--bg-void))",
        }}
      />
    </div>
  );
}

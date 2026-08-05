"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./components/AuthProvider";

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
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: "var(--bg-void)" }}
    >
      {/* ─── Background Image (Solo Leveling) ──────────── */}
      <div 
        className="absolute inset-0 z-0 opacity-20"
        style={{
          backgroundImage: 'url("https://i.pinimg.com/originals/8a/cc/14/8acc140cc536cce333b288ef39678c18.jpg")',
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      
      {/* ─── Background Overlays (Dim & Purple) ────────── */}
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="absolute inset-0 bg-accent-dim mix-blend-overlay z-0" />

      {/* ─── Background Effects ──────────────────────── */}
      <div
        className="absolute inset-0 opacity-40 z-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 30%, var(--accent-primary-dim) 0%, transparent 60%), radial-gradient(ellipse at 80% 70%, var(--accent-primary-dim) 0%, transparent 50%)",
        }}
      />

      {/* Animated grid lines */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* ─── Main Content ────────────────────────────── */}
      <div className="relative z-10 text-center px-6 w-full max-w-7xl mx-auto">
        <div className="max-w-3xl mx-auto">
          {/* System notification label */}
        <div
          className="inline-block mb-6 px-4 py-1.5 rounded text-xs tracking-widest"
          style={{
            background: "rgba(124, 58, 237, 0.1)",
            border: "1px solid rgba(124, 58, 237, 0.3)",
            color: "var(--accent-primary)",
            fontFamily: "'Rajdhani', sans-serif",
            fontWeight: 600,
          }}
        >
          SYSTEM NOTIFICATION
        </div>

        {/* Title */}
        <h1
          className="text-6xl md:text-8xl font-bold mb-4 animate-glow"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            background: "linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 50%, var(--accent-primary-light) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.1,
          }}
        >
          STUDY LEVELING
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg md:text-xl mb-2"
          style={{ color: "var(--text-secondary)", fontFamily: "'Rajdhani', sans-serif" }}
        >
          AI-Driven System
        </p>

        {/* Tagline */}
        <p
          className="text-sm md:text-base mb-12 max-w-lg mx-auto"
          style={{ color: "var(--text-muted)" }}
        >
          Every hour you study, you level up. Complete quests. Gain experience.
          Rise through the Scholar ranks. The System is watching.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href="/login">
            <button className="btn-primary text-lg px-8 py-3 animate-glow">
              Login
            </button>
          </Link>
          <Link href="/register">
            <button className="btn-secondary text-lg px-8 py-3">
              Create Account
            </button>
          </Link>
        </div>
        </div>

        {/* ─── Feature Cards ───────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-20 w-full">
          <div className="system-card p-6 text-left bg-black/40 backdrop-blur-sm border-accent-mid border">
            <div className="text-3xl mb-3">🤖</div>
            <h3
              className="text-base font-bold mb-2 tracking-wide"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}
            >
              AI QUEST MASTER
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              AI breaks your goals into daily quests, giving you a clear path forward.
            </p>
          </div>

          <div className="system-card p-6 text-left bg-black/40 backdrop-blur-sm border-accent-mid border">
            <div className="text-3xl mb-3">📈</div>
            <h3
              className="text-base font-bold mb-2 tracking-wide"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}
            >
              LEVEL & RANK UP
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Earn XP every minute you study. Climb the Scholar ranks continuously.
            </p>
          </div>

          <div className="system-card p-6 text-left bg-black/40 backdrop-blur-sm border-accent-mid border">
            <div className="text-3xl mb-3">⚡</div>
            <h3
              className="text-base font-bold mb-2 tracking-wide"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}
            >
              ADAPTIVE DIFFICULTY
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The system adapts quests to your pace to keep you in the flow state.
            </p>
          </div>

          <div className="system-card p-6 text-left bg-black/40 backdrop-blur-sm border-accent-mid border">
            <div className="text-3xl mb-3">⏱️</div>
            <h3
              className="text-base font-bold mb-2 tracking-wide"
              style={{ fontFamily: "'Rajdhani', sans-serif", color: "var(--accent-primary)" }}
            >
              STUDY TIMER
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Pomodoro, stopwatch, and automatic session tracking built right in.
            </p>
          </div>
        </div>
      </div>

      {/* ─── Bottom fade ──────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: "linear-gradient(transparent, var(--bg-void))",
        }}
      />
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useReducedMotion } from "framer-motion";
import {
  calculateRequiredXp,
  xpForNextLevel,
  rankForLevel,
  awardXP,
} from "@/lib/game-engine";
import { sessionMultiplierForSeconds } from "@/lib/session-math";

interface ProgressionCoreProps {
  /** When true (e.g. user focused waitlist input), the core subtly resonates. */
  isInputActive?: boolean;
}

type ProgressionPhase = "FOCUS" | "ACCUMULATE" | "MILESTONE" | "EQUILIBRIUM";

export default function ProgressionCore({ isInputActive = false }: ProgressionCoreProps) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Canonical Progression Data ─────────────────────────────
  // Derived directly from Sylf's real game engine — ZERO duplicated logic.
  const progressionData = useMemo(() => {
    const startingLevel = 9;
    const initialRank = rankForLevel(startingLevel); // "E"
    const bracketXP = xpForNextLevel(startingLevel); // 462 XP
    const startingXP = Math.floor(bracketXP * 0.692); // ~320 XP (~69.2% into Level 9)

    // Simulated 30-minute deep work block (1800 seconds)
    const sessionSeconds = 1800;
    const sessionMinutes = 30;
    const multiplier = sessionMultiplierForSeconds(sessionSeconds); // 1.1x
    const xpGained = Math.floor(5 * sessionMinutes * multiplier); // 165 XP

    // Canonical outcome of awarding 165 XP
    const outcome = awardXP(startingLevel, startingXP, 0, xpGained);

    return {
      startingLevel,
      initialRank,
      bracketXP,
      startingXP,
      xpGained,
      targetLevel: outcome.newLevel, // 10
      targetRank: outcome.newRank, // "D"
      newCurrentXP: outcome.newCurrentXP, // 23 XP
      newBracketXP: outcome.newXPToNextLevel, // 504 XP
    };
  }, []);

  // ─── Animation Timeline State ───────────────────────────────
  const [phase, setPhase] = useState<ProgressionPhase>("FOCUS");
  const [sessionProgress, setSessionProgress] = useState(0); // 0 to 1
  const [levelProgress, setLevelProgress] = useState(0.692); // 0.692 to 1 (then resets to ~0.046)
  const [displayLevel, setDisplayLevel] = useState(9);
  const [displayRank, setDisplayRank] = useState<"E" | "D">("E");
  const [isHovered, setIsHovered] = useState(false);

  // ─── Subtle Parallax (Restrained 2D Layer Displacement) ─────
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    // Normalized offset between -1 and 1
    const normX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
    const normY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));
    setMouseOffset({ x: normX, y: normY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseOffset({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  // ─── 9.6-Second Coordinated Progression Loop ─────────────────
  useEffect(() => {
    if (shouldReduceMotion) {
      // Reduced motion: show the dignified, completed milestone state
      setPhase("MILESTONE");
      setSessionProgress(1);
      setLevelProgress(1);
      setDisplayLevel(progressionData.targetLevel);
      setDisplayRank(progressionData.targetRank as "D");
      return;
    }

    let animationFrameId: number;
    let loopStartTime = performance.now();
    const LOOP_DURATION_MS = 9600;

    const animateLoop = (now: number) => {
      const elapsed = (now - loopStartTime) % LOOP_DURATION_MS;

      if (elapsed < 1800) {
        // Phase 1: Calm Focus Inflow (0.0s - 1.8s)
        const t = elapsed / 1800;
        setPhase("FOCUS");
        setDisplayLevel(progressionData.startingLevel);
        setDisplayRank(progressionData.initialRank as "E");
        setSessionProgress(t * 0.15);
        setLevelProgress(0.692 + t * 0.02);
      } else if (elapsed < 5800) {
        // Phase 2: Steady Accumulation (1.8s - 5.8s)
        const t = (elapsed - 1800) / 4000;
        // Ease-in-out curve for natural effort build
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setPhase("ACCUMULATE");
        setSessionProgress(0.15 + easedT * 0.85);
        setLevelProgress(0.712 + easedT * (1.0 - 0.712));
      } else if (elapsed < 7600) {
        // Phase 3: Milestone & Ascension (5.8s - 7.6s)
        setPhase("MILESTONE");
        setSessionProgress(1);
        setLevelProgress(1);
        setDisplayLevel(progressionData.targetLevel);
        setDisplayRank(progressionData.targetRank as "D");
      } else {
        // Phase 4: Settle into Equilibrium (7.6s - 9.6s)
        const t = (elapsed - 7600) / 2000;
        setPhase("EQUILIBRIUM");
        setSessionProgress(Math.max(0, 1 - t * 1.5));
        // Settle into new level bracket baseline (~23 / 504 = 0.0456)
        const targetBaseline = progressionData.newCurrentXP / progressionData.newBracketXP;
        setLevelProgress(1 - t * (1 - targetBaseline));
      }

      animationFrameId = requestAnimationFrame(animateLoop);
    };

    animationFrameId = requestAnimationFrame(animateLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [shouldReduceMotion, progressionData]);

  // ─── Geometry Constants ─────────────────────────────────────
  // SVG Center: 220, 220
  const CX = 220;
  const CY = 220;
  const OUTER_RADIUS = 175; // Outer Progression Arc
  const INNER_RADIUS = 130; // Inner Focus Chronograph Arc
  const OUTER_CIRCUMFERENCE = 2 * Math.PI * OUTER_RADIUS; // ~1099.56
  const INNER_CIRCUMFERENCE = 2 * Math.PI * INNER_RADIUS; // ~816.81

  // Outer Progression Arc Stroke Dash Offset
  const outerStrokeDashoffset = OUTER_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, levelProgress)));
  // Inner Session Chronograph Arc Stroke Dash Offset
  const innerStrokeDashoffset = INNER_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, sessionProgress)));

  // Parallax displacement factors (Max ±3.5px for restrained optical depth)
  const outerParallaxX = mouseOffset.x * 1.2;
  const outerParallaxY = mouseOffset.y * 1.2;
  const innerParallaxX = mouseOffset.x * 2.2;
  const innerParallaxY = mouseOffset.y * 2.2;
  const coreParallaxX = mouseOffset.x * 3.4;
  const coreParallaxY = mouseOffset.y * 3.4;

  const isMilestone = phase === "MILESTONE";
  const isRankD = displayRank === "D";

  // Color transitions between Rank E (slate #94a3b8) and Rank D (emerald #34d399)
  const rankColor = isRankD ? "#34d399" : "#94a3b8";
  const rankDimColor = isRankD ? "rgba(52, 211, 153, 0.15)" : "rgba(148, 163, 184, 0.12)";
  const arcPrimaryColor = isMilestone || isRankD ? "#34d399" : "#7c3aed";

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setIsHovered(true)}
      className="relative w-full max-w-[340px] xs:max-w-[380px] sm:max-w-[420px] md:max-w-[450px] aspect-square mx-auto select-none touch-manipulation flex items-center justify-center"
      aria-label="Sylf Study Progression Dial: Demonstrating focused study time advancing scholar level and rank."
      role="img"
    >
      {/* ─── Ambient Input Resonance Glow ────────────────────── */}
      <div
        className={`absolute inset-4 rounded-full transition-all duration-700 pointer-events-none ${
          isInputActive
            ? "bg-accent-primary/15 blur-2xl scale-105"
            : isMilestone
            ? "bg-emerald-500/15 blur-2xl scale-105"
            : isHovered
            ? "bg-accent-primary/10 blur-xl scale-100"
            : "bg-transparent blur-lg scale-95"
        }`}
      />

      {/* ─── Primary Vector Instrument ────────────────────────── */}
      <svg
        viewBox="0 0 440 440"
        className="w-full h-full relative z-10 overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Radial Core Background */}
          <radialGradient id="crucibleCoreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#14192b" stopOpacity="0.95" />
            <stop offset="85%" stopColor="#0b0f19" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#070a12" stopOpacity="1" />
          </radialGradient>

          {/* Outer Progression Gradient */}
          <linearGradient id="progressionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="70%" stopColor={arcPrimaryColor} />
            <stop offset="100%" stopColor={isRankD ? "#10b981" : "#a78bfa"} />
          </linearGradient>

          {/* Inner Focus Chronograph Gradient */}
          <linearGradient id="focusChronographGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(124, 58, 237, 0.4)" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>

          {/* Subtle Glow Filter for Milestone */}
          <filter id="subtleAura" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ═══ LAYER 1: OUTER AMBIENT & CALIBRATION TICKS ══════ */}
        <g
          style={{
            transform: `translate(${outerParallaxX}px, ${outerParallaxY}px)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Outermost Precision Perimeter Ring */}
          <circle
            cx={CX}
            cy={CY}
            r={198}
            stroke="var(--border-subtle)"
            strokeWidth="1"
            strokeDasharray="2 8"
            opacity="0.4"
          />

          {/* 12 Minimal Hour / Interval Tick Marks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const x1 = CX + Math.sin(angle) * 190;
            const y1 = CY - Math.cos(angle) * 190;
            const x2 = CX + Math.sin(angle) * (i % 3 === 0 ? 182 : 185);
            const y2 = CY - Math.cos(angle) * (i % 3 === 0 ? 182 : 185);
            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i % 3 === 0 ? "var(--text-secondary)" : "var(--border-subtle)"}
                strokeWidth={i % 3 === 0 ? "1.5" : "1"}
                opacity={i % 3 === 0 ? "0.6" : "0.3"}
              />
            );
          })}

          {/* 4 Cardinal Micro-Notches (N, E, S, W) */}
          <circle cx={CX} cy={CY - 198} r="2" fill="var(--text-muted)" opacity="0.8" />
          <circle cx={CX + 198} cy={CY} r="2" fill="var(--text-muted)" opacity="0.8" />
          <circle cx={CX} cy={CY + 198} r="2" fill="var(--text-muted)" opacity="0.8" />
          <circle cx={CX - 198} cy={CY} r="2" fill="var(--text-muted)" opacity="0.8" />
        </g>

        {/* ═══ LAYER 2: OUTER LEVEL PROGRESSION CRUCIBLE ══════ */}
        <g
          style={{
            transform: `translate(${outerParallaxX}px, ${outerParallaxY}px)`,
            transition: "transform 0.15s ease-out",
          }}
        >
          {/* Background Track */}
          <circle
            cx={CX}
            cy={CY}
            r={OUTER_RADIUS}
            stroke="var(--border-subtle)"
            strokeWidth="3.5"
            strokeOpacity="0.35"
          />

          {/* Active Level Progression Arc */}
          <circle
            cx={CX}
            cy={CY}
            r={OUTER_RADIUS}
            stroke="url(#progressionGradient)"
            strokeWidth={isMilestone ? "5" : "3.5"}
            strokeLinecap="round"
            strokeDasharray={OUTER_CIRCUMFERENCE}
            strokeDashoffset={outerStrokeDashoffset}
            transform={`rotate(-90 ${CX} ${CY})`}
            filter={isMilestone ? "url(#subtleAura)" : undefined}
            className="transition-all duration-300 ease-out"
          />

          {/* Milestone Radiance Wave (Active only during threshold breach) */}
          {isMilestone && (
            <circle
              cx={CX}
              cy={CY}
              r={OUTER_RADIUS}
              stroke="#34d399"
              strokeWidth="2"
              opacity="0.4"
              className="animate-ping"
              style={{ transformOrigin: `${CX}px ${CY}px`, animationDuration: "1.8s" }}
            />
          )}
        </g>

        {/* ═══ LAYER 3: INNER FOCUS CHRONOGRAPH (30M SESSION) ══ */}
        <g
          style={{
            transform: `translate(${innerParallaxX}px, ${innerParallaxY}px)`,
            transition: "transform 0.18s ease-out",
          }}
        >
          {/* Inner Chronograph Background Track */}
          <circle
            cx={CX}
            cy={CY}
            r={INNER_RADIUS}
            stroke="var(--border-subtle)"
            strokeWidth="2"
            strokeDasharray="3 5"
            strokeOpacity="0.25"
          />

          {/* Active Study Inflow Arc */}
          <circle
            cx={CX}
            cy={CY}
            r={INNER_RADIUS}
            stroke="url(#focusChronographGradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={INNER_CIRCUMFERENCE}
            strokeDashoffset={innerStrokeDashoffset}
            transform={`rotate(-90 ${CX} ${CY})`}
            className="transition-all duration-300 ease-out"
            opacity={phase === "EQUILIBRIUM" ? 0.3 : 0.85}
          />

          {/* Calibrated Minute Node along the Focus Path */}
          {sessionProgress > 0.05 && (
            <circle
              cx={CX + Math.sin(sessionProgress * 2 * Math.PI) * INNER_RADIUS}
              cy={CY - Math.cos(sessionProgress * 2 * Math.PI) * INNER_RADIUS}
              r="3.5"
              fill="#a78bfa"
              filter="drop-shadow(0 0 4px rgba(167, 139, 250, 0.8))"
            />
          )}
        </g>

        {/* ═══ LAYER 4: CENTER CRUCIBLE & SCHOLAR INSIGNIA ═════ */}
        <g
          style={{
            transform: `translate(${coreParallaxX}px, ${coreParallaxY}px)`,
            transition: "transform 0.22s ease-out",
          }}
        >
          {/* Subtle Outer Core Glow Halo */}
          <circle
            cx={CX}
            cy={CY}
            r={86}
            fill={rankDimColor}
            className="transition-colors duration-500"
          />

          {/* Core Body Container */}
          <circle
            cx={CX}
            cy={CY}
            r={80}
            fill="url(#crucibleCoreGrad)"
            stroke={isMilestone ? "#34d399" : isInputActive ? "rgba(167, 139, 250, 0.5)" : "rgba(124, 58, 237, 0.3)"}
            strokeWidth="1.5"
            className="transition-all duration-500"
          />

          {/* Subtle Inner Concentric Ring */}
          <circle
            cx={CX}
            cy={CY}
            r={72}
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* ─── Center Typographic Readouts ─────────────────── */}
          {/* Top Label: State Context */}
          <text
            x={CX}
            y={CY - 44}
            textAnchor="middle"
            fill={isRankD ? "#34d399" : "var(--accent-primary-light)"}
            fontSize="9"
            fontWeight="700"
            letterSpacing="0.16em"
            className="transition-colors duration-500 font-['Rajdhani'] uppercase select-none"
          >
            {isMilestone
              ? "RANK PROMOTION"
              : phase === "ACCUMULATE"
              ? "PROGRESS ACCUMULATING"
              : phase === "EQUILIBRIUM"
              ? "EQUILIBRIUM"
              : "DEEP FOCUS ACTIVE"}
          </text>

          {/* Primary Level Numeral */}
          <text
            x={CX}
            y={CY + 5}
            textAnchor="middle"
            fill="var(--text-primary)"
            fontSize="38"
            fontWeight="800"
            letterSpacing="-0.03em"
            className="font-['Rajdhani'] select-none transition-all duration-300"
            style={{
              textShadow: isMilestone ? "0 0 20px rgba(52, 211, 153, 0.4)" : "none",
            }}
          >
            {`LV. ${displayLevel.toString().padStart(2, "0")}`}
          </text>

          {/* Rank Badge Container */}
          <g transform={`translate(${CX - 38}, ${CY + 22})`}>
            <rect
              x="0"
              y="0"
              width="76"
              height="20"
              rx="10"
              fill={rankDimColor}
              stroke={rankColor}
              strokeWidth="1"
              strokeOpacity="0.6"
              className="transition-all duration-500"
            />
            <text
              x="38"
              y="14"
              textAnchor="middle"
              fill={rankColor}
              fontSize="10"
              fontWeight="700"
              letterSpacing="0.12em"
              className="font-['Rajdhani'] uppercase select-none transition-colors duration-500"
            >
              {`${displayRank}-RANK SCHOLAR`}
            </text>
          </g>

          {/* Bottom Context: Honest Study Connection */}
          <text
            x={CX}
            y={CY + 58}
            textAnchor="middle"
            fill="var(--text-muted)"
            fontSize="8.5"
            fontWeight="600"
            letterSpacing="0.08em"
            className="font-['Rajdhani'] uppercase select-none"
          >
            {isMilestone ? "MILESTONE REACHED" : "+165 XP • 30 MIN FOCUS"}
          </text>
        </g>
      </svg>
    </div>
  );
}

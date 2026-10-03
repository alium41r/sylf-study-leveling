"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useReducedMotion } from "framer-motion";
import { rankForLevel, xpForNextLevel } from "@/lib/game-engine";

interface SkillTreeCoreProps {
  /** When true (e.g. student focused waitlist input), the central core gently resonates. */
  isInputActive?: boolean;
}

type TreeCyclePhase = "DORMANT" | "FOCUS_FLOW" | "UNLOCK_SURGE" | "EXPANDED" | "SETTLE";

export default function SkillTreeCore({ isInputActive = false }: SkillTreeCoreProps) {
  const shouldReduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Canonical Sylf Progression Anchors ──────────────────────
  // Derives authentic scholar rank & milestone tier without duplicate logic
  const scholarContext = useMemo(() => {
    const level = 3; // Foundation Scholar (as seen in the reference identity)
    const rank = rankForLevel(level); // "E"
    const nextBracket = xpForNextLevel(level); // Required XP for next level
    return { level, rank, nextBracket };
  }, []);

  // ─── Animation Timeline State ───────────────────────────────
  const [phase, setPhase] = useState<TreeCyclePhase>("DORMANT");
  const [flowProgress, setFlowProgress] = useState(0); // 0 to 1 for conduit charging
  const [unlockPulse, setUnlockPulse] = useState(0); // 0 to 1 for milestone ring radiance
  const [isHovered, setIsHovered] = useState(false);

  // ─── Subtle Parallax (Restrained 2D Optical Layer Displacement)
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const normX = Math.max(-1, Math.min(1, (e.clientX - centerX) / (rect.width / 2)));
    const normY = Math.max(-1, Math.min(1, (e.clientY - centerY) / (rect.height / 2)));
    setMouseOffset({ x: normX, y: normY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMouseOffset({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  // ─── 10.4-Second Organic Progression Loop ───────────────────
  useEffect(() => {
    if (shouldReduceMotion) {
      setPhase("EXPANDED");
      setFlowProgress(1);
      setUnlockPulse(0);
      return;
    }

    let animationFrameId: number;
    const loopStartTime = performance.now();
    const LOOP_DURATION_MS = 10400;

    const animateLoop = (now: number) => {
      const elapsed = (now - loopStartTime) % LOOP_DURATION_MS;

      if (elapsed < 2000) {
        // State 1: Dormant Breathing (0.0s - 2.0s)
        setPhase("DORMANT");
        setFlowProgress(0);
        setUnlockPulse(0);
      } else if (elapsed < 5400) {
        // State 2: Focus Inflow & Path Activation (2.0s - 5.4s)
        const t = (elapsed - 2000) / 3400;
        // Ease-out cubic curve
        const eased = 1 - Math.pow(1 - t, 3);
        setPhase("FOCUS_FLOW");
        setFlowProgress(eased);
        setUnlockPulse(0);
      } else if (elapsed < 7200) {
        // State 3: Milestone Unlock Surge (5.4s - 7.2s)
        const t = (elapsed - 5400) / 1800;
        setPhase("UNLOCK_SURGE");
        setFlowProgress(1);
        setUnlockPulse(t);
      } else if (elapsed < 9200) {
        // State 4: Expanded Integration (7.2s - 9.2s)
        setPhase("EXPANDED");
        setFlowProgress(1);
        setUnlockPulse(0);
      } else {
        // State 5: Settle back to baseline (9.2s - 10.4s)
        const t = (elapsed - 9200) / 1200;
        setPhase("SETTLE");
        setFlowProgress(Math.max(0, 1 - t));
        setUnlockPulse(0);
      }

      animationFrameId = requestAnimationFrame(animateLoop);
    };

    animationFrameId = requestAnimationFrame(animateLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [shouldReduceMotion]);

  // ─── Optical Depth Offsets ──────────────────────────────────
  const coreParallaxX = mouseOffset.x * 4.2;
  const coreParallaxY = mouseOffset.y * 4.2;
  const branchParallaxX = mouseOffset.x * 2.4;
  const branchParallaxY = mouseOffset.y * 2.4;
  const outerParallaxX = mouseOffset.x * 1.2;
  const outerParallaxY = mouseOffset.y * 1.2;

  const isUnlocked = phase === "UNLOCK_SURGE" || phase === "EXPANDED";
  const isSurging = phase === "UNLOCK_SURGE";

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => setIsHovered(true)}
      className="relative w-full max-w-4xl lg:max-w-5xl aspect-[16/9] sm:aspect-[16/10] mx-auto select-none touch-manipulation flex items-center justify-center overflow-visible"
      aria-label="Sylf Living Skill Tree: An evolving progression network visualizing focus, study growth, and branch unlocks."
      role="img"
    >
      {/* ─── Radial Backdrop Ambient Glows ───────────────────── */}
      <div
        className={`absolute inset-x-12 inset-y-8 rounded-full pointer-events-none transition-all duration-1000 ${
          isInputActive
            ? "bg-rose-500/20 blur-3xl scale-105"
            : isSurging
            ? "bg-rose-600/25 blur-3xl scale-110"
            : isHovered
            ? "bg-rose-500/15 blur-3xl scale-100"
            : "bg-rose-950/15 blur-2xl scale-95"
        }`}
      />

      <svg
        viewBox="0 0 1000 540"
        className="w-full h-full relative z-10 overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Central Hexagon Jewel Radial Gradient */}
          <radialGradient id="nexusJewelGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="35%" stopColor="#f43f5e" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#9f1239" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4c0519" stopOpacity="0.95" />
          </radialGradient>

          {/* Central Plate Background */}
          <radialGradient id="nexusPlateGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1122" stopOpacity="0.95" />
            <stop offset="75%" stopColor="#0d0a14" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#06060c" stopOpacity="1" />
          </radialGradient>

          {/* Ruby Branch Aura Gradient */}
          <linearGradient id="rubyAuraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb7185" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#f43f5e" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#e11d48" stopOpacity="0.25" />
          </linearGradient>

          {/* Diamond White Branch Aura Gradient */}
          <linearGradient id="diamondAuraGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="40%" stopColor="#fff1f2" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fda4af" stopOpacity="0.35" />
          </linearGradient>

          {/* Unlocking Branch Dynamic Gradient */}
          <linearGradient id="unlockingConduitGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor={isUnlocked ? "#ffffff" : "#fb7185"} />
          </linearGradient>

          {/* High-Luminosity Glow Filter */}
          <filter id="softNexusGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Core Sparkle Star */}
          <filter id="coreAura" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="14" result="bigGlow" />
            <feComposite in="SourceGraphic" in2="bigGlow" operator="over" />
          </filter>
        </defs>

        {/* ═══════════════════════════════════════════════════════
            LAYER 1: OUTER DELICATE CAPILLARIES & TERMINAL NODES
            ═══════════════════════════════════════════════════════ */}
        <g
          style={{
            transform: `translate(${outerParallaxX}px, ${outerParallaxY}px)`,
            transition: "transform 0.2s ease-out",
          }}
          stroke="#334155"
          strokeWidth="1"
          opacity="0.35"
          strokeLinecap="round"
        >
          {/* Upper Left Peripheral Twigs */}
          <path d="M 200 110 C 160 95, 125 85, 80 75" />
          <path d="M 200 110 C 165 125, 130 135, 95 145" />
          <path d="M 190 170 C 150 175, 115 185, 75 195" />
          <path d="M 190 170 C 155 200, 120 220, 85 235" />
          <path d="M 270 240 C 215 245, 160 255, 105 260" />
          <path d="M 270 240 C 215 265, 165 290, 115 310" />

          {/* Lower Left Peripheral Twigs */}
          <path d="M 320 390 C 265 375, 210 360, 150 345" />
          <path d="M 220 440 C 175 435, 130 425, 85 415" />
          <path d="M 220 440 C 175 465, 135 490, 95 510" />

          {/* Upper Right Peripheral Twigs */}
          <path d="M 820 100 C 865 85, 910 75, 955 65" />
          <path d="M 820 100 C 870 115, 915 130, 955 145" />
          <path d="M 740 230 C 800 230, 860 225, 920 215" />
          <path d="M 740 230 C 800 250, 860 270, 915 290" />

          {/* Lower Right Peripheral Twigs */}
          <path d="M 800 400 C 850 405, 900 410, 950 415" />
          <path d="M 800 400 C 850 430, 900 455, 940 480" />

          {/* Bottom Root Capillaries */}
          <path d="M 440 450 C 425 480, 405 505, 385 530" />
          <path d="M 440 450 C 450 480, 460 505, 470 530" />
          <path d="M 560 440 C 575 470, 595 495, 615 525" />

          {/* Top Delicate Capillaries */}
          <path d="M 480 180 C 470 130, 455 90, 440 50" />
          <path d="M 520 180 C 530 130, 545 90, 560 50" />

          {/* Terminal Micro-Beads */}
          {[
            [80, 75], [95, 145], [75, 195], [85, 235], [105, 260], [115, 310],
            [150, 345], [85, 415], [95, 510], [955, 65], [955, 145], [920, 215],
            [915, 290], [950, 415], [940, 480], [385, 530], [470, 530], [615, 525],
            [440, 50], [560, 50],
          ].map(([bx, by], idx) => (
            <circle key={`micro-${idx}`} cx={bx} cy={by} r="2" fill="#475569" opacity="0.6" />
          ))}
        </g>

        {/* ═══════════════════════════════════════════════════════
            LAYER 2: ACTIVE PROGRESSION CONDUITS (BRANCHES)
            ═══════════════════════════════════════════════════════ */}
        <g
          style={{
            transform: `translate(${branchParallaxX}px, ${branchParallaxY}px)`,
            transition: "transform 0.18s ease-out",
          }}
        >
          {/* ─── CLUSTER A: UPPER-LEFT RUBY FLAME BRANCH ─────── */}
          {/* Outer Soft Sheaths */}
          <path d="M 468 240 C 435 235, 405 225, 375 220" stroke="url(#rubyAuraGrad)" strokeWidth="7" strokeLinecap="round" />
          <path d="M 375 220 C 345 200, 315 170, 285 150" stroke="url(#rubyAuraGrad)" strokeWidth="6" strokeLinecap="round" />
          <path d="M 375 220 C 335 225, 305 235, 265 240" stroke="url(#rubyAuraGrad)" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M 285 150 C 255 135, 225 120, 195 110" stroke="url(#rubyAuraGrad)" strokeWidth="5" strokeLinecap="round" />
          <path d="M 285 150 C 250 155, 215 165, 185 170" stroke="url(#rubyAuraGrad)" strokeWidth="5" strokeLinecap="round" />

          {/* Inner Sharp Luminous Conduits */}
          <path d="M 468 240 C 435 235, 405 225, 375 220" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
          <path d="M 375 220 C 345 200, 315 170, 285 150" stroke="#fb7185" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 375 220 C 335 225, 305 235, 265 240" stroke="#f43f5e" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M 285 150 C 255 135, 225 120, 195 110" stroke="#fda4af" strokeWidth="2" strokeLinecap="round" />
          <path d="M 285 150 C 250 155, 215 165, 185 170" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />

          {/* Core White Filaments */}
          <path d="M 468 240 C 435 235, 405 225, 375 220" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.9" />
          <path d="M 375 220 C 345 200, 315 170, 285 150" stroke="#fff1f2" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
          <path d="M 285 150 C 255 135, 225 120, 195 110" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" />

          {/* ─── CLUSTER C: UPPER-RIGHT DIAMOND WHITE BRANCH ─── */}
          {/* Radiant White & Platinum-Pink Outer Sheaths */}
          <path d="M 532 240 C 565 230, 595 220, 625 210" stroke="url(#diamondAuraGrad)" strokeWidth="8" strokeLinecap="round" />
          <path d="M 625 210 C 660 190, 695 170, 730 150" stroke="url(#diamondAuraGrad)" strokeWidth="7" strokeLinecap="round" />
          <path d="M 625 210 C 665 215, 705 225, 745 230" stroke="url(#diamondAuraGrad)" strokeWidth="6" strokeLinecap="round" />
          <path d="M 730 150 C 765 135, 800 120, 835 100" stroke="url(#diamondAuraGrad)" strokeWidth="5.5" strokeLinecap="round" />

          {/* Bright White Luminous Conduits */}
          <path d="M 532 240 C 565 230, 595 220, 625 210" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M 625 210 C 660 190, 695 170, 730 150" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M 625 210 C 665 215, 705 225, 745 230" stroke="#fff1f2" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 730 150 C 765 135, 800 120, 835 100" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />

          {/* ─── CLUSTER D: LOWER-RIGHT RUBY/MAGENTA BRANCH ─── */}
          <path d="M 532 278 C 560 295, 590 315, 615 330" stroke="url(#rubyAuraGrad)" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M 615 330 C 650 340, 685 350, 715 360" stroke="url(#rubyAuraGrad)" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M 715 360 C 745 375, 775 390, 805 400" stroke="url(#rubyAuraGrad)" strokeWidth="4.5" strokeLinecap="round" />

          <path d="M 532 278 C 560 295, 590 315, 615 330" stroke="#f43f5e" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M 615 330 C 650 340, 680 350, 715 360" stroke="#fb7185" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M 715 360 C 745 375, 775 390, 805 400" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />

          {/* ─── CLUSTER E: BOTTOM VERTICAL ROOTS ─────────────── */}
          <path d="M 500 296 C 500 320, 500 345, 500 370" stroke="url(#diamondAuraGrad)" strokeWidth="7" strokeLinecap="round" />
          <path d="M 500 370 C 480 395, 460 420, 440 450" stroke="url(#rubyAuraGrad)" strokeWidth="5" strokeLinecap="round" />
          <path d="M 500 370 C 525 395, 545 420, 565 440" stroke="url(#diamondAuraGrad)" strokeWidth="6.5" strokeLinecap="round" />

          <path d="M 500 296 C 500 320, 500 345, 500 370" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M 500 370 C 480 395, 460 420, 440 450" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" />
          <path d="M 500 370 C 525 395, 545 420, 565 440" stroke="#ffffff" strokeWidth="2.8" strokeLinecap="round" />

          {/* ─── CLUSTER B: LOWER-LEFT (THE LIVING PROGRESSION PATHWAY) ─── */}
          {/* Base Trunk: Core to Node LL1 */}
          <path d="M 468 278 C 445 295, 425 315, 405 330" stroke="url(#rubyAuraGrad)" strokeWidth="7" strokeLinecap="round" />
          <path d="M 468 278 C 445 295, 425 315, 405 330" stroke="#f43f5e" strokeWidth="3" strokeLinecap="round" />
          <path d="M 468 278 C 445 295, 425 315, 405 330" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.8" />

          {/* Dormant Conduit (LL1 to Keystone LL2) — Charges during progression! */}
          <path
            d="M 405 330 C 375 350, 345 370, 315 390"
            stroke={isUnlocked ? "url(#rubyAuraGrad)" : "rgba(244, 63, 94, 0.2)"}
            strokeWidth={isUnlocked ? "7" : "3"}
            strokeLinecap="round"
            className="transition-all duration-700"
          />

          {/* Dynamic Active Beam flowing to LL2 */}
          <path
            d="M 405 330 C 375 350, 345 370, 315 390"
            stroke="url(#unlockingConduitGrad)"
            strokeWidth={isUnlocked ? "3.2" : "2"}
            strokeLinecap="round"
            strokeDasharray="140"
            strokeDashoffset={140 * (1 - flowProgress)}
            className="transition-all duration-300 ease-out"
          />

          {/* Branch Extension from LL2 to LL3 (Unlocks at Milestone) */}
          {isUnlocked && (
            <>
              <path
                d="M 315 390 C 280 410, 245 425, 215 440"
                stroke="url(#rubyAuraGrad)"
                strokeWidth="6"
                strokeLinecap="round"
                className="animate-pulse"
              />
              <path
                d="M 315 390 C 280 410, 245 425, 215 440"
                stroke="#f43f5e"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M 315 390 C 280 410, 245 425, 215 440"
                stroke="#ffffff"
                strokeWidth="1"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Milestone Radiance Ring (Surges from Keystone LL2 at threshold unlock) */}
          {isSurging && (
            <circle
              cx="315"
              cy="390"
              r={20 + unlockPulse * 45}
              stroke="#ffffff"
              strokeWidth={Math.max(0.5, 2.5 * (1 - unlockPulse))}
              fill="none"
              opacity={1 - unlockPulse}
            />
          )}
        </g>

        {/* ═══════════════════════════════════════════════════════
            LAYER 3: CELESTIAL GLYPH NODES & MEDALLIONS
            ═══════════════════════════════════════════════════════ */}
        <g
          style={{
            transform: `translate(${branchParallaxX}px, ${branchParallaxY}px)`,
            transition: "transform 0.18s ease-out",
          }}
        >
          {/* Helper Component for Radiant Nodes */}
          {/* Node L1 (375, 220) */}
          <g transform="translate(375, 220)">
            <circle r="14" fill="#f43f5e" opacity="0.25" filter="url(#softNexusGlow)" />
            <circle r="10" fill="#180f1d" stroke="#f43f5e" strokeWidth="1.5" />
            <circle r="5" fill="#fda4af" />
            <circle r="2" fill="#ffffff" />
          </g>

          {/* Node L2 (285, 150) */}
          <g transform="translate(285, 150)">
            <circle r="16" fill="#f43f5e" opacity="0.3" filter="url(#softNexusGlow)" />
            <polygon points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6" fill="#1b0e1e" stroke="#fb7185" strokeWidth="1.5" />
            <circle r="6" fill="#fda4af" stroke="#ffffff" strokeWidth="1" />
            <circle r="2.5" fill="#ffffff" />
          </g>

          {/* Node L3 (265, 240) */}
          <g transform="translate(265, 240)">
            <circle r="11" fill="#180f1d" stroke="#f43f5e" strokeWidth="1.2" />
            <circle r="4" fill="#fb7185" />
          </g>

          {/* Node L4 (195, 110) */}
          <g transform="translate(195, 110)">
            <circle r="12" fill="#f43f5e" opacity="0.3" />
            <circle r="8" fill="#1b0e1e" stroke="#fda4af" strokeWidth="1.2" />
            <circle r="3" fill="#ffffff" />
          </g>

          {/* Node L5 (185, 170) */}
          <g transform="translate(185, 170)">
            <circle r="8" fill="#1b0e1e" stroke="#f43f5e" strokeWidth="1" />
            <circle r="3" fill="#fb7185" />
          </g>

          {/* ─── UPPER-RIGHT NODES (DIAMOND WHITE / PLATINUM) ─── */}
          {/* Node R1 (625, 210) — Luminous Diamond Medallion */}
          <g transform="translate(625, 210)">
            <circle r="22" fill="#ffffff" opacity="0.45" filter="url(#softNexusGlow)" />
            <polygon points="0,-15 13,-7.5 13,7.5 0,15 -13,7.5 -13,-7.5" fill="#201524" stroke="#ffffff" strokeWidth="2" />
            <circle r="8" fill="#ffffff" stroke="#fda4af" strokeWidth="1" />
            <circle r="3.5" fill="#fff1f2" />
          </g>

          {/* Node R2 (730, 150) — Large Hexagonal Medallion */}
          <g transform="translate(730, 150)">
            <circle r="20" fill="#ffffff" opacity="0.4" filter="url(#softNexusGlow)" />
            <polygon points="0,-14 12.1,-7 12.1,7 0,14 -12.1,7 -12.1,-7" fill="#1c1220" stroke="#ffffff" strokeWidth="1.8" />
            <circle r="7" fill="#fff1f2" stroke="#fda4af" strokeWidth="1" />
            <circle r="3" fill="#ffffff" />
          </g>

          {/* Node R3 (745, 230) */}
          <g transform="translate(745, 230)">
            <circle r="10" fill="#1b0e1e" stroke="#ffffff" strokeWidth="1.2" />
            <circle r="4" fill="#ffffff" />
          </g>

          {/* Node R4 (835, 100) — Apex Star */}
          <g transform="translate(835, 100)">
            <circle r="14" fill="#ffffff" opacity="0.4" />
            <circle r="9" fill="#1b0e1e" stroke="#ffffff" strokeWidth="1.5" />
            <circle r="4" fill="#ffffff" />
          </g>

          {/* ─── LOWER-RIGHT NODES ───────────────────────────── */}
          {/* Node D1 (615, 330) */}
          <g transform="translate(615, 330)">
            <circle r="18" fill="#f43f5e" opacity="0.35" filter="url(#softNexusGlow)" />
            <circle r="12" fill="#1a0f1d" stroke="#fb7185" strokeWidth="1.8" />
            <circle r="5" fill="#fda4af" />
            <circle r="2.5" fill="#ffffff" />
          </g>

          {/* Node D2 (715, 360) */}
          <g transform="translate(715, 360)">
            <circle r="12" fill="#180f1d" stroke="#f43f5e" strokeWidth="1.4" />
            <circle r="4" fill="#fb7185" />
          </g>

          {/* Node D3 (805, 400) */}
          <g transform="translate(805, 400)">
            <circle r="9" fill="#150d18" stroke="#f43f5e" strokeWidth="1" />
            <circle r="3" fill="#fb7185" />
          </g>

          {/* ─── BOTTOM ROOTS NODES ──────────────────────────── */}
          {/* Node B0 (500, 370) */}
          <g transform="translate(500, 370)">
            <circle r="16" fill="#ffffff" opacity="0.35" filter="url(#softNexusGlow)" />
            <circle r="11" fill="#1c1122" stroke="#ffffff" strokeWidth="1.6" />
            <circle r="5" fill="#ffffff" />
          </g>

          {/* Node BR (565, 440) — Radiant Star Root */}
          <g transform="translate(565, 440)">
            <circle r="18" fill="#ffffff" opacity="0.45" filter="url(#softNexusGlow)" />
            <polygon points="0,-12 8.5,-8.5 12,0 8.5,8.5 0,12 -8.5,8.5 -12,0 -8.5,-8.5" fill="#1f1425" stroke="#ffffff" strokeWidth="1.8" />
            <circle r="5" fill="#ffffff" />
          </g>

          {/* Node BL (440, 450) */}
          <g transform="translate(440, 450)">
            <circle r="10" fill="#180f1d" stroke="#f43f5e" strokeWidth="1.2" />
            <circle r="4" fill="#f43f5e" />
          </g>

          {/* ─── PROGRESSION UNLOCK CLUSTER (LOWER LEFT) ──────── */}
          {/* Node LL1 (405, 330) */}
          <g transform="translate(405, 330)">
            <circle r="15" fill="#f43f5e" opacity="0.3" filter="url(#softNexusGlow)" />
            <polygon points="0,-11 9.5,-5.5 9.5,5.5 0,11 -9.5,5.5 -9.5,-5.5" fill="#1c0f1e" stroke="#fb7185" strokeWidth="1.5" />
            <circle r="5" fill="#fda4af" />
          </g>

          {/* Keystone Node LL2 (315, 390) — THE LIVING PROGRESSION MILESTONE */}
          <g transform="translate(315, 390)">
            {/* Dynamic Keystone Halo */}
            <circle
              r={isUnlocked ? "24" : "14"}
              fill={isUnlocked ? "#ffffff" : "#f43f5e"}
              opacity={isUnlocked ? "0.5" : "0.15"}
              filter="url(#softNexusGlow)"
              className="transition-all duration-700"
            />
            {/* Outer Geometric Keystone Plate */}
            <polygon
              points="0,-14 12.1,-7 12.1,7 0,14 -12.1,7 -12.1,-7"
              fill={isUnlocked ? "#2a152d" : "#120e17"}
              stroke={isUnlocked ? "#ffffff" : "#475569"}
              strokeWidth={isUnlocked ? "2.2" : "1.2"}
              className="transition-all duration-700"
            />
            {/* Concentric Inner Ring */}
            <circle
              r="7"
              fill={isUnlocked ? "#ffffff" : "#1b1422"}
              stroke={isUnlocked ? "#fda4af" : "#334155"}
              strokeWidth="1"
              className="transition-all duration-700"
            />
            {/* Keystone Spark Core */}
            <circle
              r={isUnlocked ? "3.5" : "2"}
              fill={isUnlocked ? "#ffffff" : "#64748b"}
              className="transition-all duration-700"
            />
          </g>

          {/* Node LL3 (215, 440) — Unlocked Branch Apex */}
          {isUnlocked && (
            <g transform="translate(215, 440)" className="animate-in fade-in duration-500">
              <circle r="16" fill="#f43f5e" opacity="0.35" filter="url(#softNexusGlow)" />
              <circle r="10" fill="#1c0f1e" stroke="#fb7185" strokeWidth="1.6" />
              <circle r="4" fill="#fda4af" />
              <circle r="2" fill="#ffffff" />
            </g>
          )}
        </g>

        {/* ═══════════════════════════════════════════════════════
            LAYER 4: THE CENTRAL NEXUS (THE SCHOLAR CORE)
            ═══════════════════════════════════════════════════════ */}
        <g
          style={{
            transform: `translate(${coreParallaxX}px, ${coreParallaxY}px)`,
            transition: "transform 0.22s ease-out",
          }}
        >
          {/* Outer Breathing Aura Halo */}
          <circle
            cx="500"
            cy="260"
            r={isInputActive ? "110" : "90"}
            fill="url(#nexusJewelGrad)"
            opacity={isInputActive ? "0.22" : isSurging ? "0.28" : "0.14"}
            filter="url(#coreAura)"
            className="transition-all duration-700"
          />

          {/* Outer Concentric Energy Ring */}
          <circle
            cx="500"
            cy="260"
            r="64"
            stroke="rgba(244, 63, 94, 0.3)"
            strokeWidth="1"
            strokeDasharray="4 6"
            className="animate-spin"
            style={{ transformOrigin: "500px 260px", animationDuration: "40s" }}
          />

          {/* Root Conduit Connection Fillets */}
          <g stroke="#f43f5e" strokeWidth="3" opacity="0.55" strokeLinecap="round">
            <line x1="468" y1="240" x2="455" y2="236" />
            <line x1="468" y1="278" x2="455" y2="282" />
            <line x1="500" y1="296" x2="500" y2="308" />
            <line x1="532" y1="278" x2="545" y2="282" />
            <line x1="532" y1="240" x2="545" y2="236" />
            <line x1="500" y1="224" x2="500" y2="212" />
          </g>

          {/* Primary Hexagonal Nexus Body */}
          {/* Outer Hexagon */}
          <polygon
            points="500,216 538,238 538,282 500,304 462,282 462,238"
            fill="url(#nexusPlateGrad)"
            stroke={isInputActive ? "#fda4af" : "#f43f5e"}
            strokeWidth="2"
            filter="drop-shadow(0 0 12px rgba(244, 63, 94, 0.4))"
            className="transition-all duration-500"
          />

          {/* Secondary Concentric Hexagonal Ring */}
          <polygon
            points="500,226 530,243 530,277 500,294 470,277 470,243"
            fill="none"
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="1.2"
          />

          {/* Tertiary Inner Hexagonal Bezel */}
          <polygon
            points="500,236 521,248 521,272 500,284 479,272 479,248"
            fill="#120815"
            stroke="#fb7185"
            strokeWidth="1.5"
          />

          {/* Center Radiant Core Star / Jewel */}
          <polygon
            points="500,242 516,251 516,269 500,278 484,269 484,251"
            fill="url(#nexusJewelGrad)"
            stroke="#ffffff"
            strokeWidth="1.2"
            filter="drop-shadow(0 0 8px rgba(255, 255, 255, 0.8))"
          />

          {/* Center Sparkle Point */}
          <circle cx="500" cy="260" r="4.5" fill="#ffffff" filter="drop-shadow(0 0 4px #ffffff)" />
        </g>
      </svg>
    </div>
  );
}

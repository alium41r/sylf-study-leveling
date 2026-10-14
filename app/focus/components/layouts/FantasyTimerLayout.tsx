// ============================================================================
// Fantasy Experience Timer Layout — Liquid-Glass Celestial Clock (Refinement Pass)
// ============================================================================
// Minimalistic modern liquid-glass clock-shaped timer dock inspired by
// celestial observatories and magical precision horology.
//
// REFINEMENTS IN THIS PASS:
// 1. Strict Circular Blur Clipping: Backdrop blur and smoked liquid glass are
//    strictly bound to the circular orb using radial-gradient masks and clip-path.
//    No rectangular backdrop box leaks behind the clock.
// 2. Functional Layered Ring System:
//    - Primary Active Ring: Reflects real countdown progress or looping 60-second
//      sweep in open-ended/flowtime mode.
//    - Secondary Tick Ring: 60 precision time instrument ticks with 12 hour
//      markers and a dynamic sweeping highlight/pip that moves while focusing
//      and freezes in place when paused.
// 3. Ethereal Outer Astrolabe Halo: Subtle desktop-only orbital guide ring with
//    breathing glow (fantasy-glow-breathe) that pauses when session is paused
//    and respects prefers-reduced-motion.
// 4. Refined Interior Hierarchy: Small subject/phase chip at top, hero digital
//    clock digits, secondary elapsed focus telemetry, and daily study total.
// 5. Integrated Glass Pill Controls: Matching smoked glass capsules with tactile
//    specular highlights and state-aware accents.
// ============================================================================
"use client";

import React, { memo } from "react";
import { Play, Pause, Square, Coffee, FastForward, CheckCircle2, Loader2 } from "lucide-react";
import { FocusTimerLayoutProps } from "../FocusTimerLayoutProps";
import { FocusTimerDockProps } from "./FocusTimerDockProps";
import {
  resolveEffectiveTimerPosition,
  getFocusTimerDockClasses,
} from "@/lib/focus-background-types";

// SVG Astronomical Constants for 320x320 coordinate space
const CLOCK_SIZE = 320;
const CENTER = CLOCK_SIZE / 2; // 160
const TICK_RADIUS = 150;
const PROGRESS_RADIUS = 140;
const CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS; // ~879.646

// ────────────────────────────────────────────────────────────────────────────
// Subcomponent: Functional Precision Tick Ring
// ────────────────────────────────────────────────────────────────────────────
interface FantasyTickRingProps {
  activeSecond: number;
  isPaused: boolean;
  isNotStarted: boolean;
  accentColor: string;
}

function FantasyTickRing({
  activeSecond,
  isPaused,
  isNotStarted,
  accentColor,
}: FantasyTickRingProps) {
  // Angle for second sweep marker: 0deg at 12 o'clock
  const sweepAngle = isNotStarted ? 0 : (activeSecond / 60) * 360;

  return (
    <g className="transition-opacity duration-500">
      {/* 60 Precision Instrument Ticks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const deg = i * 6;
        const isHourTick = i % 5 === 0;
        const isCardinal = i % 15 === 0;
        const isNorthStar = i === 0;
        const isPassed = !isNotStarted && i <= activeSecond;
        const isCurrent = !isNotStarted && i === activeSecond;

        // Radial lengths for tick lines
        const y1 = isNorthStar ? 6 : isCardinal ? 6 : isHourTick ? 8 : 10;
        const y2 = 13;
        const strokeWidth = isNorthStar ? 2 : isCardinal ? 1.5 : isHourTick ? 1.25 : 0.75;

        // Color and opacity: active passed ticks glow softly, future ticks are subdued
        const strokeColor = isCurrent
          ? accentColor
          : isPassed
          ? isPaused
            ? "rgba(245, 158, 11, 0.45)"
            : "rgba(255, 255, 255, 0.45)"
          : "rgba(255, 255, 255, 0.15)";

        return (
          <g key={i} transform={`rotate(${deg} ${CENTER} ${CENTER})`}>
            {/* North Star Cardinal Glyph at 12 o'clock */}
            {isNorthStar ? (
              <>
                <line
                  x1={CENTER}
                  y1={y1}
                  x2={CENTER}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                <circle
                  cx={CENTER}
                  cy="4"
                  r="2"
                  fill={accentColor}
                  style={{
                    filter: `drop-shadow(0 0 5px ${accentColor})`,
                  }}
                />
              </>
            ) : (
              <line
                x1={CENTER}
                y1={y1}
                x2={CENTER}
                y2={y2}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}

      {/* Sweeping Precision Marker / Orb: traverses the 60 ticks */}
      {!isNotStarted && (
        <g
          transform={`rotate(${sweepAngle} ${CENTER} ${CENTER})`}
          style={{
            transition: isPaused
              ? "none"
              : "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Glowing orbital diamond marker */}
          <circle
            cx={CENTER}
            cy={CENTER - TICK_RADIUS}
            r="3.5"
            fill="#ffffff"
            style={{
              filter: `drop-shadow(0 0 6px ${isPaused ? "#f59e0b" : accentColor})`,
            }}
          />
          <circle
            cx={CENTER}
            cy={CENTER - TICK_RADIUS}
            r="1.75"
            fill={isPaused ? "#f59e0b" : accentColor}
          />
        </g>
      )}
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponent: Functional Active Progress Ring
// ────────────────────────────────────────────────────────────────────────────
interface FantasyProgressRingProps {
  progressPercent: number;
  strokeDashoffset: number;
  accentColor: string;
  isNotStarted: boolean;
  isPaused: boolean;
  isCountdown: boolean;
}

function FantasyProgressRing({
  progressPercent,
  strokeDashoffset,
  accentColor,
  isNotStarted,
  isPaused,
  isCountdown,
}: FantasyProgressRingProps) {
  // Angular position of the progress star bead
  const progressAngle = (progressPercent / 100) * 360;

  return (
    <g className="transition-opacity duration-500">
      <defs>
        <linearGradient id="fantasyCelestialGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Outer subtle boundary hairline */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r="154"
        fill="none"
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="1"
      />

      {/* Progress Track (faint translucent glass groove) */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={PROGRESS_RADIUS}
        fill="none"
        stroke="rgba(255, 255, 255, 0.07)"
        strokeWidth="2.5"
      />

      {/* Inner Constellation Orbit Hairline */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r="125"
        fill="none"
        stroke="rgba(255, 255, 255, 0.05)"
        strokeWidth="1"
        strokeDasharray="2 5"
      />

      {/* Primary Dynamic Progress Ring — Restrained Cyan to Violet Gradient */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={PROGRESS_RADIUS}
        fill="none"
        stroke={isPaused ? "#f59e0b" : "url(#fantasyCelestialGrad)"}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={isNotStarted ? CIRCUMFERENCE : strokeDashoffset}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
        style={{
          transition: isPaused
            ? "stroke 0.5s ease"
            : "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease",
          filter: `drop-shadow(0 0 6px ${isPaused ? "rgba(245, 158, 11, 0.6)" : "rgba(168, 85, 247, 0.45)"})`,
        }}
      />

      {/* Celestial Orbit Star Bead at tip of active progress arc */}
      {!isNotStarted && progressPercent > 0 && (
        <g
          transform={`rotate(${progressAngle} ${CENTER} ${CENTER})`}
          style={{
            transition: isPaused
              ? "none"
              : "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <circle
            cx={CENTER}
            cy={CENTER - PROGRESS_RADIUS}
            r="3.5"
            fill="#ffffff"
            style={{
              filter: `drop-shadow(0 0 6px ${isPaused ? "#f59e0b" : "#06b6d4"})`,
            }}
          />
          <circle
            cx={CENTER}
            cy={CENTER - PROGRESS_RADIUS}
            r="1.5"
            fill={isPaused ? "#f59e0b" : "#a855f7"}
          />
        </g>
      )}
    </g>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponent: Desktop Ethereal Astrolabe Halo
// ────────────────────────────────────────────────────────────────────────────
interface FantasyAstrolabeHaloProps {
  isPaused: boolean;
}

function FantasyAstrolabeHalo({ isPaused }: FantasyAstrolabeHaloProps) {
  return (
    <div
      className="hidden sm:block absolute pointer-events-none fantasy-glow-breathe text-[var(--accent-primary-light)] w-[450px] h-[450px] sm:w-[500px] sm:h-[500px] md:w-[535px] md:h-[535px] top-[157px] xs:top-[172px] sm:top-[197px] md:top-[212px] left-1/2 -translate-x-1/2 -translate-y-1/2 z-0"
      aria-hidden="true"
      style={{
        animationPlayState: isPaused ? "paused" : "running",
      }}
    >
      <svg viewBox="0 0 400 400" className="w-full h-full stroke-current fill-none">
        {/* Outer celestial astrolabe orbit */}
        <circle
          cx="200"
          cy="200"
          r="192"
          strokeWidth="1"
          strokeDasharray="3 6"
          className="opacity-25"
        />
        {/* Astrolabe quadrant alignment lines */}
        <line x1="200" y1="2" x2="200" y2="14" strokeWidth="1.5" className="opacity-50" />
        <line x1="200" y1="386" x2="200" y2="398" strokeWidth="1.5" className="opacity-50" />
        <line x1="2" y1="200" x2="14" y2="200" strokeWidth="1.5" className="opacity-50" />
        <line x1="386" y1="200" x2="398" y2="200" strokeWidth="1.5" className="opacity-50" />
        {/* Four celestial node stars */}
        <circle cx="200" cy="8" r="2" className="fill-current opacity-70" />
        <circle cx="392" cy="200" r="2" className="fill-current opacity-70" />
        <circle cx="200" cy="392" r="2" className="fill-current opacity-70" />
        <circle cx="8" cy="200" r="2" className="fill-current opacity-70" />
        {/* Astrolabe degree angle arc */}
        <path
          d="M 335,65 A 192,192 0 0,0 200,8"
          strokeWidth="1.5"
          strokeDasharray="1 4"
          className="opacity-35"
        />
      </svg>
    </div>
  );
}

// ── Reusable Presentational Fantasy Celestial Dock ───────────────────────────
export const FantasyTimerDock = memo(function FantasyTimerDock({
  formattedDisplayTime,
  phaseColor,
  phaseLabel,
  isPaused = false,
  pauseReason,
  isFocusing = false,
  isNotStarted = false,
  title,
  subtitle,
  elapsedFormatted,
  breakFormatted,
  dailyTotalFormatted,
  sessionDots,
  stretchNudge,
  progressPercent = 0,
  activeSecond = 0,
  isCountdown = false,
  primaryAction,
  secondaryActions,
  density = "default",
  context = "solo",
  testId = "party-timer-dock-fantasy",
  className = "",
}: FocusTimerDockProps & { className?: string }) {
  const activeAccentColor = isPaused ? "#f59e0b" : phaseColor;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progressPercent / 100);

  return (
    <div
      data-testid={testId}
      className={`relative flex flex-col items-center select-none z-10 ${className}`}
    >
      {/* Astrolabe Orbital Ring Halo */}
      <div
        className={`hidden sm:block absolute ${
          density === "compact" ? "-inset-4" : "-inset-6 sm:-inset-8"
        } pointer-events-none fantasy-glow-breathe text-[var(--accent-primary-light)]`}
        aria-hidden="true"
      >
        <svg viewBox="0 0 400 400" className="w-full h-full stroke-current fill-none">
          <circle
            cx="200"
            cy="200"
            r="192"
            strokeWidth="0.75"
            strokeDasharray="4 8"
            className="opacity-45"
          />
          <circle
            cx="200"
            cy="200"
            r="174"
            strokeWidth="1"
            strokeDasharray="1 6"
            className="opacity-30"
          />
          <g className="opacity-35">
            <line x1="200" y1="2" x2="200" y2="12" strokeWidth="1.5" />
            <line x1="200" y1="388" x2="200" y2="398" strokeWidth="1.5" />
            <line x1="2" y1="200" x2="12" y2="200" strokeWidth="1.5" />
            <line x1="388" y1="200" x2="398" y2="200" strokeWidth="1.5" />
          </g>
        </svg>
      </div>

      {/* ─── Circular Liquid-Glass Clock Dial ─────────────────────── */}
      <div
        className={`relative ${
          density === "compact"
            ? "w-[205px] h-[205px] xs:w-[220px] xs:h-[220px] sm:w-[235px] sm:h-[235px] md:w-[250px] md:h-[250px] p-3"
            : "w-[265px] h-[265px] xs:w-[285px] xs:h-[285px] sm:w-[310px] sm:h-[310px] md:w-[335px] md:h-[335px] p-4 sm:p-5"
        } rounded-full flex flex-col items-center justify-center text-center backdrop-blur-xl transition-all z-10`}
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at center, black calc(100% - 0.5px), transparent 100%)",
          maskImage:
            "radial-gradient(circle at center, black calc(100% - 0.5px), transparent 100%)",
          clipPath: "circle(50% at 50% 50%)",
          background:
            "radial-gradient(135% 135% at 50% 12%, rgba(255, 255, 255, 0.12) 0%, rgba(20, 30, 50, 0.28) 45%, rgba(10, 16, 30, 0.46) 80%, rgba(6, 10, 20, 0.58) 100%)",
          boxShadow: `
            inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.35),
            inset 0 -1px 1px 0 rgba(255, 255, 255, 0.05),
            inset 0 0 25px 0 rgba(255, 255, 255, 0.02),
            0 0 30px ${isPaused ? "rgba(245, 158, 11, 0.16)" : "rgba(168, 85, 247, 0.20)"},
            0 20px 50px rgba(0, 0, 0, 0.65)
          `,
          border: "1px solid rgba(255, 255, 255, 0.14)",
        }}
      >
        {/* Top Specular Crescent Reflection */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none opacity-60"
          style={{
            background:
              "radial-gradient(ellipse 65% 30% at 50% 0%, rgba(255, 255, 255, 0.20) 0%, rgba(255, 255, 255, 0.04) 50%, transparent 80%)",
          }}
          aria-hidden="true"
        />

        {/* Ambient Phase Glow */}
        <div
          className="absolute inset-4 rounded-full pointer-events-none transition-all duration-700"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${
              isPaused ? "rgba(245, 158, 11, 0.12)" : `${phaseColor}14`
            } 0%, transparent 70%)`,
          }}
          aria-hidden="true"
        />

        {/* SVG Astronomical Clock Face */}
        <svg
          viewBox="0 0 320 320"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <FantasyTickRing
            activeSecond={activeSecond}
            isPaused={isPaused}
            isNotStarted={isNotStarted}
            accentColor={activeAccentColor}
          />
          <FantasyProgressRing
            progressPercent={progressPercent}
            strokeDashoffset={strokeDashoffset}
            accentColor={phaseColor}
            isNotStarted={isNotStarted}
            isPaused={isPaused}
            isCountdown={isCountdown}
          />
        </svg>

        {/* Dial Core Content */}
        <div
          className={`relative z-10 flex flex-col items-center justify-center ${
            density === "compact"
              ? "max-w-[160px] xs:max-w-[175px] sm:max-w-[190px] md:max-w-[200px]"
              : "max-w-[245px] xs:max-w-[265px] sm:max-w-[290px] md:max-w-[315px]"
          } px-1`}
        >
          {/* Top Chip: Subject / Quest Capsule / Mode */}
          {(title || subtitle || context === "party") && (
            <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/[0.08] border border-white/15 backdrop-blur-md max-w-full mb-1 shadow-sm">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                style={{
                  backgroundColor: activeAccentColor,
                  boxShadow: `0 0 6px ${activeAccentColor}`,
                }}
              />
              <span
                data-testid="my-timer-badge"
                className="text-[10px] font-bold uppercase tracking-wider text-white/90 truncate font-['Rajdhani'] max-w-[140px]"
                title={title || subtitle || phaseLabel}
              >
                {title || subtitle || phaseLabel}
              </span>
            </div>
          )}

          {/* Clean Dominant Digits (Tabular, calm, high contrast) */}
          <div
            data-testid="my-live-timer"
            className={`font-medium font-sans tracking-tight tabular-nums leading-none my-0.5 sm:my-1 select-none text-center whitespace-nowrap ${
              density === "compact"
                ? formattedDisplayTime.length > 5
                  ? "text-2xl xs:text-3xl sm:text-[34px] md:text-[36px]"
                  : "text-3xl xs:text-4xl sm:text-5xl"
                : formattedDisplayTime.length > 5
                ? "text-[36px] xs:text-[42px] sm:text-[48px] md:text-[54px] tracking-tight"
                : "text-5xl xs:text-6xl sm:text-[66px] md:text-[72px]"
            }`}
            style={{
              color: activeAccentColor,
              fontVariantNumeric: "tabular-nums",
              textShadow: `0 2px 14px rgba(0, 0, 0, 0.95), 0 0 20px ${activeAccentColor}30`,
              transition: "color 0.5s ease",
            }}
          >
            {formattedDisplayTime}
          </div>

          {/* Central Telemetry (Elapsed / Paused / Daily) */}
          {(elapsedFormatted || isPaused || breakFormatted || dailyTotalFormatted) && (
            <div className="text-center font-mono text-xs text-white/75 min-h-[18px] flex flex-col justify-center mt-0.5 space-y-0.5">
              {isPaused ? (
                <p className="text-amber-400 font-bold font-['Rajdhani'] uppercase tracking-wider text-[11px] sm:text-xs animate-pulse">
                  {pauseReason === "break-over" ? "Break Over • Press Resume" : "Session Paused"}
                </p>
              ) : (
                <>
                  {elapsedFormatted && (
                    <p className="text-white/70 text-[11px] tracking-wide">
                      Elapsed <strong className="text-white/95 font-medium tabular-nums">{elapsedFormatted}</strong>
                    </p>
                  )}
                  {breakFormatted && (
                    <p className="text-emerald-300 text-[11px]">
                      Break <strong className="font-medium tabular-nums">{breakFormatted}</strong>
                    </p>
                  )}
                  {dailyTotalFormatted && (
                    <p className="text-white/60 text-[10px] tracking-wider">
                      Daily <strong className="text-white/90 font-medium tabular-nums">{dailyTotalFormatted}</strong>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Session Stars (Solo Only) */}
          {sessionDots && (
            <div
              className="flex items-center gap-1.5 mt-1"
              title={`Session ${sessionDots.current} of ${sessionDots.total}`}
            >
              {Array.from({ length: sessionDots.total }).map((_, i) => (
                <div
                  key={i}
                  className="transition-all duration-300"
                  style={{
                    width: i + 1 === sessionDots.current ? "5.5px" : "4px",
                    height: i + 1 === sessionDots.current ? "5.5px" : "4px",
                    borderRadius: "50%",
                    backgroundColor:
                      i + 1 <= sessionDots.current
                        ? activeAccentColor
                        : "rgba(255, 255, 255, 0.2)",
                    boxShadow:
                      i + 1 === sessionDots.current ? `0 0 8px ${activeAccentColor}` : "none",
                  }}
                />
              ))}
            </div>
          )}

          {/* Stretch Nudge */}
          {stretchNudge && (
            <button
              onClick={stretchNudge.onAction}
              className="mt-2 py-1 px-3 rounded-full border border-amber-400/40 bg-amber-500/20 text-amber-200 text-[10px] sm:text-[11px] font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm animate-pulse"
            >
              <Coffee className="w-3 h-3" />
              <span>{stretchNudge.message}</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Integrated Liquid-Glass Pill Controls ─────────────────── */}
      {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
        <div
          className={`mt-3 sm:mt-4 flex flex-wrap items-center justify-center gap-2.5 ${
            density === "compact" ? "max-w-[250px]" : "max-w-[320px] sm:max-w-[340px]"
          } px-2 z-10`}
        >
          {primaryAction && (
            <button
              type="button"
              data-testid={
                primaryAction.testId ||
                (isFocusing ? "pause-timer-btn" : isPaused ? "resume-timer-btn" : "start-timer-btn")
              }
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.isLoading}
              className={`flex items-center justify-center gap-2 px-6 py-2 rounded-full backdrop-blur-xl text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all shadow-lg active:scale-95 cursor-pointer group disabled:opacity-50 ${
                isPaused
                  ? "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-200"
                  : "bg-white/[0.12] hover:bg-white/[0.22] border border-white/25 hover:border-[var(--accent-primary-light)] text-white"
              }`}
              style={{
                boxShadow: isPaused
                  ? "inset 0 1px 1px rgba(255,255,255,0.2), 0 4px 16px rgba(245,158,11,0.25)"
                  : "inset 0 1px 1px rgba(255,255,255,0.25), 0 4px 16px rgba(0,0,0,0.4)",
              }}
            >
              {primaryAction.isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : primaryAction.icon === "play" ? (
                <>
                  <Play className="w-3.5 h-3.5 text-amber-300 fill-current group-hover:scale-110 transition-transform" />
                  <span>{primaryAction.label}</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-white fill-current group-hover:scale-110 transition-transform" />
                  <span>{primaryAction.label}</span>
                </>
              )}
            </button>
          )}

          {secondaryActions?.map((sec, idx) => (
            <button
              key={idx}
              type="button"
              data-testid={sec.testId}
              onClick={sec.onClick}
              disabled={sec.disabled || sec.isLoading}
              className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-full backdrop-blur-xl text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all cursor-pointer shadow-md disabled:opacity-50 ${
                sec.variant === "end"
                  ? "bg-black/35 hover:bg-red-500/20 active:scale-95 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300"
                  : sec.variant === "complete"
                  ? "w-full py-2 px-4 rounded-full bg-emerald-600/85 hover:bg-emerald-500 active:scale-95 border border-emerald-400/40 text-white shadow-lg shadow-emerald-950/40 mt-1"
                  : sec.variant === "break"
                  ? "bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/35 text-amber-200"
                  : "bg-white/[0.10] hover:bg-white/[0.18] active:scale-95 border border-white/20 text-white"
              }`}
            >
              {sec.icon === "square" && <Square className="w-3 h-3 fill-current" />}
              {sec.icon === "coffee" && <Coffee className="w-3.5 h-3.5" />}
              {sec.icon === "fast-forward" && <FastForward className="w-3.5 h-3.5" />}
              {sec.icon === "check" && <CheckCircle2 className="w-4 h-4 text-emerald-200" />}
              <span>{sec.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export const FantasyTimerLayout = memo(function FantasyTimerLayout({
  formattedDisplayTime,
  elapsedSeconds,
  todayElapsedSeconds = elapsedSeconds,
  breakSeconds,
  remainingSeconds,
  isCountdown,
  isBreak,
  phase,
  phaseColor,
  phaseLabel,
  subjectName,
  questData,
  initialTotalSeconds,
  currentSession,
  totalSessions,
  showSessionDots,
  isPaused,
  pauseReason,
  isEnding,
  flowNudge,
  onTogglePause,
  onEndSession,
  onCompleteQuest,
  onTakeFlowBreak,
  onSkipFlowBreak,
  background,
  formatTime,
  isPreview = false,
}: FocusTimerLayoutProps) {
  // 1. Resolve Effective Docking Position (explicit admin setting wins over focalX)
  const effectivePosition = resolveEffectiveTimerPosition(
    background?.timerPosition,
    background?.focalX
  );

  // Outer docking placement (controls screen positioning ONLY, not inner alignment)
  const dockClasses = getFocusTimerDockClasses(effectivePosition, isPreview);

  // 2. Derive Active State
  const isNotStarted = elapsedSeconds === 0 && !isPaused && !isBreak;
  const activeSecond = elapsedSeconds % 60;

  // 3. Circular Progress Percentage (0 - 100)
  let progressPercent = 0;
  if (isCountdown && remainingSeconds !== null) {
    const total = elapsedSeconds + remainingSeconds;
    progressPercent = total > 0 ? Math.max(0, Math.min(100, (elapsedSeconds / total) * 100)) : 0;
  } else if (!isNotStarted) {
    progressPercent = ((elapsedSeconds % 60) / 60) * 100;
  }

  // Map Solo actions to contract
  const primaryAction =
    phase !== "done"
      ? {
          label: isPaused ? "Resume" : "Pause",
          icon: isPaused ? ("play" as const) : ("pause" as const),
          onClick: onTogglePause,
        }
      : undefined;

  const secondaryActions = [];
  if (onTakeFlowBreak && phase === "focus" && remainingSeconds === null) {
    secondaryActions.push({
      label: "Break",
      icon: "coffee" as const,
      onClick: onTakeFlowBreak,
      variant: "break" as const,
    });
  }
  if (onSkipFlowBreak && isBreak) {
    secondaryActions.push({
      label: "Skip Break",
      icon: "fast-forward" as const,
      onClick: onSkipFlowBreak,
      variant: "skip" as const,
    });
  }
  secondaryActions.push({
    label: isEnding ? "Ending..." : "End",
    icon: "square" as const,
    onClick: onEndSession,
    variant: "end" as const,
    disabled: isEnding,
  });
  if (questData && onCompleteQuest) {
    secondaryActions.push({
      label: "Complete Quest",
      icon: "check" as const,
      onClick: onCompleteQuest,
      variant: "complete" as const,
      disabled: isEnding,
    });
  }

  return (
    <div className="w-full flex-1 flex flex-col justify-between py-4 sm:py-6 px-4 md:px-8 z-10 select-none">
      {/* ─── Center / Docking Zone: Liquid-Glass Celestial Clock ──────── */}
      <FantasyTimerDock
        formattedDisplayTime={formattedDisplayTime}
        phaseColor={phaseColor}
        phaseLabel={phaseLabel}
        isPaused={isPaused}
        pauseReason={pauseReason}
        isFocusing={phase === "focus"}
        isNotStarted={isNotStarted}
        title={questData ? questData.title : subjectName}
        elapsedFormatted={
          isCountdown
            ? formatTime(elapsedSeconds)
            : !isNotStarted
            ? formatTime(elapsedSeconds)
            : null
        }
        breakFormatted={breakSeconds > 0 && isBreak ? formatTime(breakSeconds) : null}
        dailyTotalFormatted={formatTime(initialTotalSeconds + todayElapsedSeconds)}
        sessionDots={showSessionDots ? { current: currentSession, total: totalSessions } : null}
        progressPercent={progressPercent}
        activeSecond={activeSecond}
        isCountdown={isCountdown}
        stretchNudge={
          flowNudge && onTakeFlowBreak
            ? {
                message: `Stretch (${formatTime(elapsedSeconds)})?`,
                onAction: onTakeFlowBreak,
              }
            : null
        }
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        density="default"
        context="solo"
        testId="solo-timer-dock-fantasy"
        className={`w-full my-auto py-2 ${dockClasses.dockAlignment} ${dockClasses.margin}`}
      />

      {/* ─── Bottom Spacer ───────────────────────────────────────────── */}
      <div className="w-full h-6 shrink-0" />
    </div>
  );
});

// ============================================================================
// Landscape Experience Timer Layout (Phase 3B)
// ============================================================================
// Cinematic, spacious, and minimally obstructive timer overlay.
// - Philosophy: IMAGE FIRST, TIMER SECOND, CONTROLS THIRD.
// - Eliminates heavy glass box chrome in favor of floating typography directly over the scene.
// - Localized soft vignette / contrast backing to ensure legibility across bright vistas.
// - Docked in the lower third (left, right, or center) based on timerPosition / focalX.
// - State-aware controls: only displays actions relevant to the current timer phase.
// - Mobile-optimized: compact lower layout preserving 70%+ of scenic artwork.
// ============================================================================
"use client";

import React, { memo } from "react";
import { Play, Pause, Square, Coffee, FastForward, CheckCircle2 } from "lucide-react";
import { FocusTimerLayoutProps } from "../FocusTimerLayoutProps";
import {
  resolveEffectiveTimerPosition,
  getFocusTimerDockClasses,
} from "@/lib/focus-background-types";

import { FocusTimerDockProps } from "./FocusTimerDockProps";
import { Loader2 } from "lucide-react";

// ── Reusable Presentational Landscape Dock ───────────────────────────────────
export const LandscapeTimerDock = memo(function LandscapeTimerDock({
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
  progressPercent = 100,
  isCountdown = false,
  sessionDots,
  stretchNudge,
  primaryAction,
  secondaryActions,
  density = "default",
  context = "solo",
  testId = "party-timer-dock-landscape",
}: FocusTimerDockProps) {
  return (
    <div
      data-testid={testId}
      className={`relative flex flex-col items-center text-center ${
        density === "compact"
          ? "px-4 py-3 sm:px-5 sm:py-3.5 max-w-[360px] sm:max-w-[400px]"
          : "px-5 py-3.5 sm:px-7 sm:py-5 max-w-[390px] xs:max-w-[430px] sm:max-w-[480px] md:max-w-[500px]"
      } rounded-2xl sm:rounded-3xl bg-black/30 backdrop-blur-[6px] backdrop-saturate-[160%] border border-white/[0.12] transition-all w-full select-none overflow-hidden`}
      style={{
        boxShadow: `
          inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.25),
          inset 0 -1px 1px 0 rgba(255, 255, 255, 0.05),
          0 16px 36px -8px rgba(0, 0, 0, 0.65),
          0 0 20px -2px ${phaseColor}15
        `,
      }}
    >
      {/* Top Specular Sheen */}
      <div
        className="absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/35 to-transparent pointer-events-none"
        aria-hidden="true"
      />

      {/* Subject / Context & Session Dots */}
      <div className="flex items-center justify-between w-full px-1 mb-0.5">
        <div className="flex items-center gap-1.5 truncate">
          {context === "party" ? (
            <span
              data-testid="my-timer-badge"
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-[0.16em] uppercase backdrop-blur-md border border-white/10 bg-black/30 shadow-sm"
              style={{
                fontFamily: "'Rajdhani', sans-serif",
                color: phaseColor,
              }}
            >
              {phaseLabel}
            </span>
          ) : (title || subtitle) ? (
            <div className="flex items-center gap-1.5 text-center truncate">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }}
              />
              <span className="text-xs font-medium text-white/90 truncate max-w-[240px] tracking-wide">
                {title || subtitle}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-center">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }}
              />
              <span className="text-xs font-medium text-white/70 tracking-wide uppercase font-['Rajdhani']">
                {phaseLabel}
              </span>
            </div>
          )}
        </div>

        {/* Session Dots on Top Right if Pomodoro */}
        {sessionDots && sessionDots.total > 1 && (
          <div
            className="flex items-center gap-1 ml-2 shrink-0"
            title={`Session ${sessionDots.current} of ${sessionDots.total}`}
          >
            {Array.from({ length: sessionDots.total }).map((_, i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{
                  backgroundColor:
                    i + 1 <= sessionDots.current ? phaseColor : "rgba(255, 255, 255, 0.25)",
                  boxShadow: i + 1 === sessionDots.current ? `0 0 6px ${phaseColor}` : "none",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Large Cinematic Digits (Dominant, tabular-nums, clean sans, calm) */}
      <div
        data-testid="my-live-timer"
        className={`${
          density === "compact"
            ? "text-5xl xs:text-6xl sm:text-7xl"
            : "text-5xl xs:text-6xl sm:text-7xl md:text-8xl"
        } font-medium font-sans tracking-tight tabular-nums leading-none my-1 select-none text-white text-center drop-shadow-[0_2px_16px_rgba(0,0,0,0.9)]`}
        style={{
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 24px rgba(0,0,0,0.85), 0 0 16px ${phaseColor}40`,
        }}
      >
        {formattedDisplayTime}
      </div>

      {/* Telemetry Row: Elapsed on left, Daily total on right */}
      {(elapsedFormatted || isPaused || dailyTotalFormatted || breakFormatted) && (
        <div className="flex items-center justify-between w-full text-[11px] font-mono text-white/70 mt-1 px-1">
          {/* Left: Pause state or elapsed */}
          <div>
            {isPaused ? (
              <span className="text-amber-300 font-bold font-['Rajdhani'] tracking-widest uppercase text-xs animate-pulse">
                {pauseReason === "break-over" ? "Break Over • Press Resume" : "Session Paused"}
              </span>
            ) : elapsedFormatted ? (
              <span className="text-white/60">
                Elapsed <strong className="text-white/95 font-medium tabular-nums">{elapsedFormatted}</strong>
              </span>
            ) : null}
          </div>

          {/* Right: Daily cumulative total or break timer */}
          <div className="flex items-center gap-2">
            {dailyTotalFormatted && (
              <span className="text-white/60">
                Daily Total <strong className="text-white/95 font-medium tabular-nums">{dailyTotalFormatted}</strong>
              </span>
            )}
            {breakFormatted && (
              <span className="text-emerald-300">
                Break <strong className="font-medium tabular-nums">{breakFormatted}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Minimalist Progress Line */}
      {isCountdown && (
        <div className="w-full h-[2.5px] rounded-full bg-white/15 overflow-hidden my-2">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progressPercent}%`,
              background: `linear-gradient(90deg, ${phaseColor}cc, ${phaseColor})`,
              boxShadow: `0 0 8px ${phaseColor}`,
            }}
          />
        </div>
      )}

      {/* Flowtime stretch-break nudge */}
      {stretchNudge && (
        <button
          onClick={stretchNudge.onAction}
          className="mt-2 w-full py-1.5 px-3 rounded-xl border border-amber-400/40 bg-amber-500/20 text-amber-300 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Coffee className="w-3.5 h-3.5" />
          <span>{stretchNudge.message}</span>
        </button>
      )}

      {/* ─── State-Aware Cinematic Controls Strip ──────────────────── */}
      {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 w-full flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction && (
            <button
              type="button"
              data-testid={
                primaryAction.testId ||
                (isFocusing ? "pause-timer-btn" : isPaused ? "resume-timer-btn" : "start-timer-btn")
              }
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.isLoading}
              className={`flex items-center gap-2 px-5 py-2 rounded-full active:scale-95 border text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                isPaused
                  ? "bg-amber-500/25 hover:bg-amber-500/35 border-amber-400/40 text-amber-200"
                  : "bg-white/[0.14] hover:bg-white/[0.24] border-white/25 text-white"
              }`}
              style={{
                boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.25), 0 4px 14px rgba(0, 0, 0, 0.35)",
              }}
            >
              {primaryAction.isLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : primaryAction.icon === "play" ? (
                <>
                  <Play className="w-3.5 h-3.5 text-amber-300 fill-current" />
                  <span>{primaryAction.label}</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5 text-white fill-current" />
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
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all cursor-pointer disabled:opacity-50 ${
                sec.variant === "end"
                  ? "bg-black/35 hover:bg-red-500/20 active:scale-95 border border-white/10 hover:border-red-500/30 text-white/70 hover:text-red-300"
                  : sec.variant === "complete"
                  ? "w-full mt-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-full bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 border border-emerald-400/50 text-white shadow-lg shadow-emerald-950/40"
                  : sec.variant === "break"
                  ? "bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/30 text-amber-200"
                  : "bg-white/10 hover:bg-white/20 border border-white/20 text-white/90"
              }`}
              style={{
                boxShadow: sec.variant === "end" ? "inset 0 1px 1px rgba(255, 255, 255, 0.08)" : "inset 0 1px 1px rgba(255, 255, 255, 0.15)",
              }}
            >
              {sec.icon === "square" && <Square className="w-2.5 h-2.5 fill-current" />}
              {sec.icon === "coffee" && <Coffee className="w-3.5 h-3.5" />}
              {sec.icon === "fast-forward" && <FastForward className="w-3.5 h-3.5" />}
              {sec.icon === "check" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />}
              <span>{sec.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export const LandscapeTimerLayout = memo(function LandscapeTimerLayout({
  formattedDisplayTime,
  elapsedSeconds,
  breakSeconds,
  remainingSeconds,
  isCountdown,
  isBreak,
  phase,
  phaseColor,
  phaseLabel,
  modeDisplayName,
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
  // 1. Resolve Effective Docking Position (explicit admin setting wins over focalX heuristic)
  const effectivePosition = resolveEffectiveTimerPosition(
    background?.timerPosition,
    background?.focalX
  );

  // Outer docking placement (controls screen positioning ONLY, not inner alignment)
  const dockClasses = getFocusTimerDockClasses(effectivePosition, isPreview);

  // Progress percentage for subtle cinematic bar
  const progressPercent =
    isCountdown && remainingSeconds !== null
      ? Math.max(0, Math.min(100, (elapsedSeconds / (elapsedSeconds + remainingSeconds || 1)) * 100))
      : 100;

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
      label: "Take Break",
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
    <div className="w-full flex-1 flex flex-col justify-between pt-4 pb-4 sm:pb-6 px-4 md:px-8 z-10 select-none">
      {/* ─── Top Ambient Bar: Unified Focus Status Container ─────────── */}
      <div className="w-full flex items-center justify-between px-2 pt-0 pointer-events-none">
        {/* Single Combined Status Container */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div
            className="h-8 flex items-center gap-2 sm:gap-2.5 px-3.5 rounded-full text-xs backdrop-blur-xl border border-white/10 bg-black/35 shadow-lg max-w-[calc(100vw-200px)] sm:max-w-none overflow-hidden"
            style={{
              fontFamily: "'Rajdhani', sans-serif",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              style={{ backgroundColor: phaseColor, boxShadow: `0 0 8px ${phaseColor}` }}
            />
            <span
              className="font-bold tracking-[0.16em] uppercase shrink-0"
              style={{ color: phaseColor }}
            >
              {phaseLabel}
            </span>
            {modeDisplayName.toUpperCase() !== phaseLabel.toUpperCase() && (
              <>
                <span className="text-white/20 shrink-0">•</span>
                <span className="text-white/60 font-medium tracking-wider uppercase shrink-0">
                  {modeDisplayName}
                </span>
              </>
            )}
            {(questData || subjectName) && (
              <>
                <span className="text-white/20 shrink-0">|</span>
                <span className="text-white/40 font-mono text-[11px] shrink-0 hidden sm:inline">
                  focusing on:
                </span>
                <span className="text-white font-medium truncate max-w-[160px] sm:max-w-[260px] font-mono text-xs">
                  {questData ? questData.title : subjectName}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Lower-Third Cinematic HUD ─────────────────────────────────── */}
      {/* Positioned towards bottom so scenic vista remains wide open above */}
      <div className={`w-full flex flex-col mt-auto mb-3 sm:mb-6 md:mb-8 ${dockClasses.dockAlignment} ${dockClasses.margin}`}>
        <LandscapeTimerDock
          formattedDisplayTime={formattedDisplayTime}
          phaseColor={phaseColor}
          phaseLabel={phaseLabel}
          isPaused={isPaused}
          pauseReason={pauseReason}
          isFocusing={phase === "focus"}
          isNotStarted={false}
          title={questData ? questData.title : subjectName}
          elapsedFormatted={formatTime(elapsedSeconds)}
          dailyTotalFormatted={formatTime(initialTotalSeconds + elapsedSeconds)}
          breakFormatted={breakSeconds > 0 && isBreak ? formatTime(breakSeconds) : null}
          progressPercent={progressPercent}
          isCountdown={isCountdown}
          sessionDots={showSessionDots ? { current: currentSession, total: totalSessions } : null}
          stretchNudge={
            flowNudge && onTakeFlowBreak
              ? {
                  message: `Stretch break (${formatTime(elapsedSeconds)})?`,
                  onAction: onTakeFlowBreak,
                }
              : null
          }
          primaryAction={primaryAction}
          secondaryActions={secondaryActions}
          density="default"
          context="solo"
          testId="solo-timer-dock-landscape"
        />
      </div>
    </div>
  );
});

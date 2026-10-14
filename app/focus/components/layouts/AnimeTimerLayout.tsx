// ============================================================================
// Anime Experience Timer Layout (Phase 3A)
// ============================================================================
// Cinematic, artwork-first focus layout composed around negative space.
// - Resolves desktop docking via explicit admin timerPosition or focalX heuristic.
// - Restrained, lightweight floating glass pod without heavy obscuring panels.
// - Artwork remains the hero while keeping timer digits and controls ultra-legible.
// ============================================================================
"use client";

import React, { memo } from "react";
import { CheckCircle2, Play, Pause, Square, Coffee, FastForward } from "lucide-react";
import { FocusTimerLayoutProps } from "../FocusTimerLayoutProps";
import {
  resolveEffectiveTimerPosition,
  getFocusTimerDockClasses,
} from "@/lib/focus-background-types";

import { FocusTimerDockProps } from "./FocusTimerDockProps";
import { Loader2 } from "lucide-react";

// ── Reusable Presentational Anime Dock ───────────────────────────────────────
export const AnimeTimerDock = memo(function AnimeTimerDock({
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
  sessionDots,
  stretchNudge,
  primaryAction,
  secondaryActions,
  density = "default",
  context = "solo",
  testId = "party-timer-dock-anime",
}: FocusTimerDockProps) {
  const isLongTime = formattedDisplayTime.length > 5;
  const currentSecond = Number(formattedDisplayTime.slice(-2)) || 0;
  const isCountdownMode = progressPercent < 100;
  const gaugePercent = isCountdownMode ? progressPercent : (currentSecond / 60) * 100;
  const orbitalAngle = isCountdownMode ? (progressPercent / 100) * 360 : (currentSecond / 60) * 360;

  return (
    <div
      data-testid={testId}
      className={`relative w-full ${
        density === "compact"
          ? "max-w-sm sm:max-w-md p-3.5 sm:p-4.5"
          : "max-w-sm sm:max-w-xl lg:max-w-2xl p-4 sm:p-6"
      } rounded-tl-[36px] rounded-bl-[44px] rounded-tr-[22px] rounded-br-[32px] border border-white/[0.14] bg-black/35 backdrop-blur-xl shadow-[0_18px_45px_rgba(0,0,0,0.65)] transition-all select-none overflow-hidden`}
      style={{
        boxShadow: `
          inset 0 1.5px 1.5px 0 rgba(255, 255, 255, 0.22),
          inset 0 -1px 1px 0 rgba(255, 255, 255, 0.05),
          0 20px 45px -10px rgba(0, 0, 0, 0.7),
          0 0 24px -2px ${phaseColor}18
        `,
      }}
    >
      {/* Top Specular Arc Highlight */}
      <div
        className="absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
        aria-hidden="true"
      />

      {/* Main Asymmetric Flex Layout: Left Focus Lens + Center Content + Right Actions */}
      <div className="flex flex-col sm:flex-row items-center sm:items-stretch gap-3 sm:gap-5">
        {/* ─── Left Overlapping Glass Focus Lens / Tactical Button (◯) ── */}
        <button
          type="button"
          data-testid="anime-lens-trigger-btn"
          onClick={primaryAction?.onClick}
          disabled={!primaryAction || primaryAction.disabled || primaryAction.isLoading}
          title={
            primaryAction
              ? isPaused
                ? "Click to resume session (Chrono Pod)"
                : "Click to pause session (Chrono Pod)"
              : "Focus Rhythm Gauge"
          }
          aria-label={isPaused ? "Resume focus session" : "Pause focus session"}
          className="group relative shrink-0 flex items-center justify-center p-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 cursor-pointer disabled:cursor-default"
        >
          <div
            className="w-14 h-14 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-full bg-white/[0.08] group-hover:bg-white/[0.14] backdrop-blur-2xl border border-white/25 shadow-lg flex items-center justify-center relative overflow-hidden transition-all duration-300 group-hover:scale-[1.03] active:scale-95"
            style={{
              boxShadow: `
                inset 0 1px 1.5px rgba(255, 255, 255, 0.35),
                0 6px 20px rgba(0, 0, 0, 0.4),
                0 0 18px ${isPaused ? "#f59e0b" : phaseColor}25
              `,
            }}
          >
            {/* SVG Progress Arc in Lens */}
            <svg viewBox="0 0 64 64" className="w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 -rotate-90 pointer-events-none">
              {/* Outer Track */}
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="rgba(255, 255, 255, 0.12)"
                strokeWidth="2.5"
                fill="none"
              />
              {/* Active Progress Stroke */}
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke={isPaused ? "#f59e0b" : phaseColor}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26 * (1 - (gaugePercent || 0) / 100)}
                style={{
                  filter: `drop-shadow(0 0 6px ${isPaused ? "#f59e0b" : phaseColor})`,
                  transition: isPaused ? "none" : "stroke-dashoffset 0.5s ease",
                }}
              />
            </svg>

            {/* Orbiting Second Bead (rotates around perimeter each minute) */}
            <div
              className="absolute inset-0 pointer-events-none transition-transform duration-500 ease-linear"
              style={{
                transform: `rotate(${orbitalAngle}deg)`,
              }}
            >
              <div
                className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full absolute top-[5px] left-1/2 -translate-x-1/2 shadow-sm"
                style={{
                  backgroundColor: isPaused ? "#f59e0b" : "#ffffff",
                  boxShadow: `0 0 8px ${isPaused ? "#f59e0b" : phaseColor}`,
                }}
              />
            </div>

            {/* Center Core: Live Rhythm / Percentage / Pause Glyph */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none transition-opacity duration-200 group-hover:opacity-0">
              {isPaused ? (
                <div className="flex flex-col items-center justify-center">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 fill-amber-300 ml-0.5" />
                  <span className="text-[7px] sm:text-[8px] font-['Rajdhani'] font-bold uppercase tracking-wider text-amber-300/90 mt-0.5">
                    PAUSED
                  </span>
                </div>
              ) : isCountdownMode ? (
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[11px] sm:text-xs font-mono font-bold tracking-tight text-white/95 tabular-nums">
                    {Math.round(progressPercent)}%
                  </span>
                  <span className="text-[7px] sm:text-[8px] font-['Rajdhani'] font-bold uppercase tracking-widest text-white/50">
                    FLOW
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  <span className="text-[11px] sm:text-xs font-mono font-bold tracking-tight text-white/95 tabular-nums">
                    {String(currentSecond).padStart(2, "0")}s
                  </span>
                  <span
                    className="text-[7px] sm:text-[8px] font-['Rajdhani'] font-bold uppercase tracking-widest"
                    style={{ color: phaseColor }}
                  >
                    RHYTHM
                  </span>
                </div>
              )}
            </div>

            {/* Hover Trigger Action Overlay (Appears on Hover) */}
            {primaryAction && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                {isPaused ? (
                  <>
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300 fill-amber-300 ml-0.5" />
                    <span className="text-[7px] sm:text-[8px] font-['Rajdhani'] font-bold uppercase tracking-widest text-amber-200 mt-0.5">
                      RESUME
                    </span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4 sm:w-5 sm:h-5 text-white fill-white" />
                    <span className="text-[7px] sm:text-[8px] font-['Rajdhani'] font-bold uppercase tracking-widest text-white/90 mt-0.5">
                      PAUSE
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </button>

        {/* ─── Center Body: Subject, Time, Telemetry ───────────────── */}
        <div className="flex-1 flex flex-col justify-center text-center sm:text-left min-w-0 pr-2 sm:pr-4">
          {/* Header Row: Subject & Mode Badge */}
          <div className="flex items-center justify-center sm:justify-start gap-2 mb-0.5">
            {context === "party" ? (
              <span
                data-testid="my-timer-badge"
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm"
                style={{
                  fontFamily: "'Rajdhani', sans-serif",
                  color: phaseColor,
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  borderColor: "rgba(255, 255, 255, 0.15)",
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isFocusing ? "animate-pulse" : ""}`}
                  style={{
                    backgroundColor: phaseColor,
                    boxShadow: isFocusing ? `0 0 8px ${phaseColor}` : "none",
                  }}
                />
                <span>{phaseLabel}</span>
              </span>
            ) : (
              <div className="flex items-center gap-1.5 truncate">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: phaseColor, boxShadow: `0 0 6px ${phaseColor}` }}
                />
                <span
                  className="text-xs font-semibold text-white/90 truncate tracking-wide"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  {title || subtitle || phaseLabel}
                </span>
              </div>
            )}
          </div>

          {/* Clean Dominant Digits */}
          <div
            data-testid="my-live-timer"
            className={`${
              density === "compact"
                ? isLongTime
                  ? "text-3xl xs:text-4xl sm:text-4xl"
                  : "text-4xl xs:text-5xl sm:text-5xl"
                : isLongTime
                ? "text-3xl xs:text-4xl sm:text-5xl md:text-[3.25rem]"
                : "text-5xl xs:text-6xl sm:text-6xl md:text-7xl"
            } font-medium font-sans tracking-tight tabular-nums leading-none my-0.5 select-none text-white whitespace-nowrap drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]`}
            style={{
              fontVariantNumeric: "tabular-nums",
              color: phaseColor,
              textShadow: `0 0 24px rgba(0, 0, 0, 0.85), 0 0 16px ${phaseColor}40`,
            }}
          >
            {formattedDisplayTime}
          </div>

          {/* Sub-timers & Telemetry */}
          {(elapsedFormatted || isPaused || dailyTotalFormatted || breakFormatted) && (
            <div className="mt-1 flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-0.5 text-xs font-mono text-white/70">
              {isPaused ? (
                <span className="text-amber-400 font-bold font-['Rajdhani'] uppercase tracking-wider text-xs animate-pulse">
                  {pauseReason === "break-over" ? "Break Over • Press Resume" : "Session Paused"}
                </span>
              ) : (
                <>
                  {elapsedFormatted && (
                    <span>
                      Elapsed <strong className="text-white/95 font-medium tabular-nums">{elapsedFormatted}</strong>
                      {breakFormatted && (
                        <span className="text-emerald-400"> · Break {breakFormatted}</span>
                      )}
                    </span>
                  )}
                  {dailyTotalFormatted && (
                    <span className="text-white/60">
                      Today <strong className="text-white/90 font-medium tabular-nums">{dailyTotalFormatted}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* Session Dots */}
          {sessionDots && sessionDots.total > 1 && (
            <div className="flex items-center justify-center sm:justify-start gap-1.5 mt-1.5">
              {Array.from({ length: sessionDots.total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor:
                      i + 1 <= sessionDots.current ? phaseColor : "rgba(255, 255, 255, 0.2)",
                    boxShadow: i + 1 === sessionDots.current ? `0 0 6px ${phaseColor}` : "none",
                  }}
                />
              ))}
            </div>
          )}

          {/* Flowtime stretch-break nudge */}
          {stretchNudge && (
            <button
              onClick={stretchNudge.onAction}
              className="mt-2 w-full py-1.5 px-3 rounded-xl border border-amber-400/50 bg-amber-400/15 text-amber-300 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-400/25 transition-all animate-pulse flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Coffee className="w-3.5 h-3.5" />
              <span>{stretchNudge.message}</span>
            </button>
          )}
        </div>

        {/* ─── Right Controls: Stacked or Pill Actions ───────────────── */}
        {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
          <div className="shrink-0 flex flex-col justify-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-white/10 sm:pl-5 sm:ml-1">
            {primaryAction && (
              <button
                type="button"
                data-testid={
                  primaryAction.testId ||
                  (isFocusing ? "pause-timer-btn" : isPaused ? "resume-timer-btn" : "start-timer-btn")
                }
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.isLoading}
                className={`w-full sm:w-28 flex items-center justify-center gap-2 py-2 px-3 rounded-full text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all cursor-pointer shadow-md active:scale-95 disabled:opacity-50 ${
                  isPaused
                    ? "bg-amber-500/25 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200"
                    : "bg-white/[0.14] hover:bg-white/[0.22] border border-white/20 text-white"
                }`}
                style={{
                  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.2), 0 4px 12px rgba(0, 0, 0, 0.35)",
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
                className={`w-full sm:w-28 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-bold uppercase tracking-wider font-['Rajdhani'] transition-all cursor-pointer disabled:opacity-50 ${
                  sec.variant === "end"
                    ? "bg-black/35 hover:bg-red-500/20 active:scale-95 border border-white/10 hover:border-red-500/30 text-white/70 hover:text-red-300"
                    : sec.variant === "complete"
                    ? "w-full py-2 px-3 rounded-full bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 border border-emerald-400/50 text-white shadow-lg shadow-emerald-950/40"
                    : sec.variant === "break"
                    ? "bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200"
                    : "bg-white/10 hover:bg-white/15 border border-white/15 text-white/90"
                }`}
                style={{
                  boxShadow: sec.variant === "end" ? "inset 0 1px 1px rgba(255, 255, 255, 0.08)" : "inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                }}
              >
                {sec.icon === "square" && <Square className="w-2.5 h-2.5 fill-current" />}
                {sec.icon === "coffee" && <Coffee className="w-3 h-3" />}
                {sec.icon === "fast-forward" && <FastForward className="w-3 h-3" />}
                {sec.icon === "check" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />}
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export const AnimeTimerLayout = memo(function AnimeTimerLayout({
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
  initialSubjectSeconds,
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

  // Progress percentage for focus lens circular ring
  const progressPercent =
    isCountdown && remainingSeconds !== null
      ? Math.max(0, Math.min(100, (elapsedSeconds / (elapsedSeconds + remainingSeconds || 1)) * 100))
      : 100;

  return (
    <div className="w-full flex-1 flex flex-col justify-between pt-4 pb-4 sm:pb-6 px-4 md:px-8 z-10 select-none">
      {/* ─── Center / Docking Zone: Asymmetric Glass Pod ─────────────── */}
      <div className={`w-full flex flex-col my-auto py-2 ${dockClasses.dockAlignment} ${dockClasses.margin}`}>
        <AnimeTimerDock
          formattedDisplayTime={formattedDisplayTime}
          phaseColor={phaseColor}
          phaseLabel={phaseLabel}
          isPaused={isPaused}
          pauseReason={pauseReason}
          isFocusing={phase === "focus"}
          isNotStarted={false}
          title={questData ? questData.title : subjectName}
          subtitle={
            questData && subjectName && subjectName.toLowerCase() !== questData.title.toLowerCase()
              ? subjectName
              : null
          }
          elapsedFormatted={formatTime(elapsedSeconds)}
          breakFormatted={breakSeconds > 0 ? formatTime(breakSeconds) : null}
          dailyTotalFormatted={formatTime(initialTotalSeconds + todayElapsedSeconds)}
          progressPercent={progressPercent}
          sessionDots={showSessionDots ? { current: currentSession, total: totalSessions } : null}
          stretchNudge={
            flowNudge && onTakeFlowBreak
              ? {
                  message: `You've focused ${formatTime(elapsedSeconds)} — stretch break?`,
                  onAction: onTakeFlowBreak,
                }
              : null
          }
          primaryAction={primaryAction}
          secondaryActions={secondaryActions}
          density="default"
          context="solo"
          testId="solo-timer-dock-anime"
        />
      </div>

      {/* ─── Bottom Spacer ───────────────────────────────────────────── */}
      <div className="w-full h-8 shrink-0" />
    </div>
  );
});


// ============================================================================
// Classic Sylf Timer Layout (Mechanical Extraction)
// ============================================================================
// Preserves the exact, authentic Focus Timer visual presentation and controls.
// The shared session bar is owned by FocusTimerLayoutRouter.
//   - Centered digital clock with ambient text glow
//   - Sub-timers and daily cumulative totals
//   - Bottom action controls
// ============================================================================
"use client";

import React, { memo } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FocusTimerLayoutProps } from "../FocusTimerLayoutProps";
import { FocusTimerDockProps } from "./FocusTimerDockProps";
import { resolveEffectiveTimerPosition } from "@/lib/focus-background-types";

// ── Classic Orbiting Liquid Glass Glow Bar (1 full revolution per min) ─────
export const ClassicOrbitingGlowBar = memo(function ClassicOrbitingGlowBar({
  isPaused = false,
  idPrefix = "classic-orbit",
}: {
  isPaused?: boolean;
  idPrefix?: string;
}) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${idPrefix}-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
          <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="75%" stopColor="#22d3ee" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        <filter id={`${idPrefix}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect
        x="1"
        y="1"
        rx="23"
        width="calc(100% - 2px)"
        height="calc(100% - 2px)"
        fill="none"
        stroke={`url(#${idPrefix}-gradient)`}
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="12 88"
        className="classic-orbiting-bar"
        style={{
          width: "calc(100% - 2px)",
          height: "calc(100% - 2px)",
          filter: `url(#${idPrefix}-glow)`,
          animationPlayState: isPaused ? "paused" : "running",
        }}
      />
    </svg>
  );
});

// ── Reusable Presentational Classic Dock ─────────────────────────────────────
export const ClassicTimerDock = memo(function ClassicTimerDock({
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
  subjectTotalFormatted,
  sessionDots,
  stretchNudge,
  primaryAction,
  secondaryActions,
  density = "default",
  context = "solo",
  testId = "party-timer-dock-classic",
}: FocusTimerDockProps) {
  return (
    <div
      data-testid={testId}
      className={`w-full ${
        density === "compact"
          ? "max-w-sm sm:max-w-md p-4 sm:p-5"
          : "max-w-sm sm:max-w-md lg:max-w-lg p-6 sm:p-8"
      } rounded-3xl border border-white/12 bg-black/40 backdrop-blur-xl backdrop-saturate-[150%] shadow-[0_20px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all flex flex-col items-center justify-center text-center select-none relative overflow-hidden`}
    >
      {/* ─── Orbiting Liquid Glass Glowing Bar (60s Revolution) ─── */}
      <ClassicOrbitingGlowBar isPaused={isPaused} idPrefix={testId} />

      {/* Subtle technical corner accents & specular highlight */}
      <div className="absolute top-2.5 left-2.5 w-2 h-2 border-t border-l border-cyan-400/40 rounded-tl-sm pointer-events-none" />
      <div className="absolute top-2.5 right-2.5 w-2 h-2 border-t border-r border-cyan-400/40 rounded-tr-sm pointer-events-none" />
      <div className="absolute bottom-2.5 left-2.5 w-2 h-2 border-b border-l border-cyan-400/40 rounded-bl-sm pointer-events-none" />
      <div className="absolute bottom-2.5 right-2.5 w-2 h-2 border-b border-r border-cyan-400/40 rounded-br-sm pointer-events-none" />
      <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent pointer-events-none" />

      {/* Mode / Phase Badge */}
      <div className="flex items-center justify-center mb-1">
        <span
          data-testid="my-timer-badge"
          className="text-[10px] sm:text-xs tracking-[0.2em] uppercase font-bold px-3 py-0.5 rounded-full border shadow-sm transition-colors"
          style={{
            fontFamily: "'Rajdhani', sans-serif",
            color: phaseColor,
            backgroundColor: "var(--accent-primary-dim)",
            borderColor: "var(--accent-primary-mid)",
          }}
        >
          {phaseLabel}
        </span>
      </div>

      {/* Main Focus Title flanked by technical hairlines */}
      {(title || subtitle) && (
        <div className="w-full flex items-center justify-center gap-3 mt-1 mb-1 px-2">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
          <h2
            className="text-xs sm:text-sm font-bold tracking-widest text-text-primary uppercase line-clamp-1"
            style={{ fontFamily: "'Rajdhani', sans-serif" }}
          >
            {title || subtitle}
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
        </div>
      )}

      {/* Confident Digital Tabular Timer */}
      <div
        data-testid="my-live-timer"
        className={`${
          density === "compact"
            ? "text-5xl sm:text-6xl"
            : "text-5xl xs:text-6xl sm:text-7xl"
        } font-bold font-mono tracking-tight tabular-nums leading-none my-2 select-none text-center`}
        style={{
          color: phaseColor,
          textShadow: `0 0 32px rgba(0, 0, 0, 0.7), 0 0 16px ${phaseColor}40`,
          fontVariantNumeric: "tabular-nums",
          transition: "color 0.5s ease",
        }}
      >
        {formattedDisplayTime}
      </div>

      {/* Sub-timers */}
      {(elapsedFormatted || isPaused) && (
        <div className="mt-1 font-mono text-xs sm:text-sm text-text-muted text-center">
          {elapsedFormatted && (
            <p>
              Total elapsed: {elapsedFormatted}
              {breakFormatted && (
                <span className="text-accent-green/80">
                  {" · "}Break: {breakFormatted}
                </span>
              )}
            </p>
          )}

          {isPaused && (
            <p className="text-accent-gold/80 font-['Rajdhani'] font-bold uppercase tracking-wider">
              {pauseReason === "break-over"
                ? "Break over — press Resume to continue focusing"
                : "Session paused — press Resume to continue"}
            </p>
          )}
        </div>
      )}

      {/* Flowtime stretch-break nudge */}
      {stretchNudge && (
        <button
          onClick={stretchNudge.onAction}
          className="mt-3 w-full px-4 py-2 rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-300 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-400/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {stretchNudge.message}
        </button>
      )}

      {/* Daily Cumulative Totals inside Pod */}
      {(subjectTotalFormatted || dailyTotalFormatted) && (
        <div className="mt-5 pt-3.5 border-t border-white/10 w-full flex items-center justify-around font-mono text-xs sm:text-sm text-text-secondary">
          {subjectTotalFormatted && (
            <div className="flex flex-col items-center">
              <span
                className="text-[10px] tracking-widest uppercase mb-0.5 text-text-muted font-bold font-['Rajdhani']"
              >
                Today&apos;s Subject
              </span>
              <span className="font-bold text-text-primary tabular-nums">
                {subjectTotalFormatted}
              </span>
            </div>
          )}
          {subjectTotalFormatted && dailyTotalFormatted && (
            <div className="h-6 w-px bg-white/10" />
          )}
          {dailyTotalFormatted && (
            <div className="flex flex-col items-center">
              <span
                className="text-[10px] tracking-widest uppercase mb-0.5 text-text-muted font-bold font-['Rajdhani']"
              >
                Daily Cumulative
              </span>
              <span className="font-bold text-text-primary tabular-nums">
                {dailyTotalFormatted}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Session Dots */}
      {sessionDots && (
        <div className="flex gap-2 mt-3.5 pt-3 border-t border-white/10 justify-center">
          {Array.from({ length: sessionDots.total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background:
                  i + 1 < sessionDots.current
                    ? phaseColor
                    : i + 1 === sessionDots.current
                    ? `${phaseColor}`
                    : "rgba(255, 255, 255, 0.2)",
                boxShadow: i + 1 === sessionDots.current ? `0 0 8px ${phaseColor}` : "none",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
      )}

      {/* Integrated Action Button (Used in Party Context) */}
      {context === "party" && primaryAction && (
        <div className="mt-3 sm:mt-4">
          <button
            type="button"
            data-testid={
              primaryAction.testId ||
              (isFocusing ? "pause-timer-btn" : isPaused ? "resume-timer-btn" : "start-timer-btn")
            }
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled || primaryAction.isLoading}
            className="flex items-center gap-2.5 px-7 py-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all duration-200 border border-white/15 hover:border-cyan-400/40 shadow-lg text-text-primary cursor-pointer disabled:opacity-50"
          >
            {primaryAction.isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : primaryAction.icon === "play" ? (
              <>
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span
                  className="text-xs sm:text-sm uppercase tracking-wider font-bold font-['Rajdhani']"
                >
                  {primaryAction.label}
                </span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                <span
                  className="text-xs sm:text-sm uppercase tracking-wider font-bold font-['Rajdhani']"
                >
                  {primaryAction.label}
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
});

export const ClassicTimerLayout = memo(function ClassicTimerLayout({
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
  modeDisplayName,
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
  // Resolve effective docking position from background settings (explicit position takes precedence over focalX)
  const effectivePosition = resolveEffectiveTimerPosition(
    background?.timerPosition,
    background?.focalX
  );

  const isDocked = Boolean(background && effectivePosition !== "center");
  const prefix = isPreview ? "" : "md:";

  // Outer placement for the timer and bottom controls
  const dockAlignmentClass =
    isDocked && effectivePosition === "right"
      ? `${prefix}self-end ${prefix}mr-8 lg:mr-14`
      : isDocked && effectivePosition === "left"
      ? `${prefix}self-start ${prefix}ml-8 lg:ml-14`
      : `${prefix}self-center`;

  const centerAlignmentClass = dockAlignmentClass;
  const controlsAlignmentClass = dockAlignmentClass;

  return (
    <>
      {/* ─── Center Core: Digital Timer & Sub-stats ─ */}
      <div className={`flex-1 min-h-0 flex flex-col items-center justify-center my-auto py-4 z-10 w-full transition-all duration-300 ${isDocked ? "max-w-2xl" : "max-w-4xl text-center"} ${centerAlignmentClass}`}>
        {isDocked ? (
          <ClassicTimerDock
            formattedDisplayTime={formattedDisplayTime}
            phaseColor={phaseColor}
            phaseLabel={
              questData
                ? phaseLabel
                : modeDisplayName.toUpperCase() === phaseLabel.toUpperCase()
                ? phaseLabel
                : `${modeDisplayName} • ${phaseLabel}`
            }
            isPaused={isPaused}
            pauseReason={pauseReason}
            isFocusing={phase === "focus"}
            isNotStarted={false}
            elapsedFormatted={isCountdown ? formatTime(elapsedSeconds) : null}
            breakFormatted={breakSeconds > 0 ? formatTime(breakSeconds) : null}
            subjectTotalFormatted={formatTime(initialSubjectSeconds + todayElapsedSeconds)}
            dailyTotalFormatted={formatTime(initialTotalSeconds + todayElapsedSeconds)}
            sessionDots={showSessionDots ? { current: currentSession, total: totalSessions } : null}
            stretchNudge={
              flowNudge && onTakeFlowBreak
                ? {
                    message: `You've focused ${formatTime(elapsedSeconds)} — stretch break?`,
                    onAction: onTakeFlowBreak,
                  }
                : null
            }
            density="default"
            context="solo"
            testId="solo-timer-dock-classic"
          />
        ) : (
          /* Clean Digital Focus Instrument Chassis (Centered Presentation) */
          <div className="relative w-full max-w-lg sm:max-w-xl mx-auto px-6 py-6 sm:px-8 sm:py-7 rounded-3xl border border-white/12 bg-black/40 backdrop-blur-xl backdrop-saturate-[150%] shadow-[0_20px_50px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] transition-all flex flex-col items-center justify-center text-center select-none overflow-hidden">
            {/* Liquid glass glowing perimeter orbit bar (revolves 1x per minute) */}
            <ClassicOrbitingGlowBar isPaused={isPaused} idPrefix="classic-centered-chassis" />

            {/* Subtle technical corner accents & specular highlight */}
            <div className="absolute top-2.5 left-2.5 w-2.5 h-2.5 border-t border-l border-cyan-400/40 rounded-tl-sm pointer-events-none" />
            <div className="absolute top-2.5 right-2.5 w-2.5 h-2.5 border-t border-r border-cyan-400/40 rounded-tr-sm pointer-events-none" />
            <div className="absolute bottom-2.5 left-2.5 w-2.5 h-2.5 border-b border-l border-cyan-400/40 rounded-bl-sm pointer-events-none" />
            <div className="absolute bottom-2.5 right-2.5 w-2.5 h-2.5 border-b border-r border-cyan-400/40 rounded-br-sm pointer-events-none" />
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/25 to-transparent pointer-events-none" />

            {/* Technical hairline header */}
            <div className="w-full flex items-center justify-center gap-3 mb-2 px-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
              <span
                className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-cyan-400/80 uppercase"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                {modeDisplayName}
              </span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
            </div>

            {/* Large Confident Tabular Timer */}
            <div
              className="text-6xl sm:text-7xl md:text-8xl font-bold font-mono tracking-tight tabular-nums leading-none my-2 select-none text-center"
              style={{
                color: phaseColor,
                textShadow: `0 0 35px ${phaseColor}40, 0 0 60px rgba(0,0,0,0.8)`,
                fontVariantNumeric: "tabular-nums",
                transition: "color 0.5s ease",
              }}
            >
              {formattedDisplayTime}
            </div>

            {/* Sub-timers */}
            {isCountdown && (
              <p className="mt-1 font-mono text-xs sm:text-sm text-text-muted">
                Total elapsed: {formatTime(elapsedSeconds)}
                {breakSeconds > 0 && (
                  <span className="text-accent-green/80">
                    {" · "}Break: {formatTime(breakSeconds)}
                  </span>
                )}
              </p>
            )}

            {!isCountdown && isBreak && breakSeconds > 0 && (
              <p className="mt-1 font-mono text-xs sm:text-sm text-text-muted">
                Break: {formatTime(breakSeconds)} — not counted as study time
              </p>
            )}
            {isPaused && (
              <p className="mt-1.5 font-mono text-xs sm:text-sm text-accent-gold/90 font-['Rajdhani'] font-bold uppercase tracking-wider">
                {pauseReason === "break-over"
                  ? "Break over — press Resume to continue focusing"
                  : "Session paused — press Resume to continue"}
              </p>
            )}

            {/* Flow nudge */}
            {flowNudge && onTakeFlowBreak && (
              <button
                onClick={onTakeFlowBreak}
                className="mt-3 px-5 py-2 rounded-full border border-amber-400/50 bg-amber-400/10 text-amber-300 text-xs font-['Rajdhani'] font-bold uppercase tracking-wider hover:bg-amber-400/20 transition-all cursor-pointer"
              >
                You&apos;ve focused {formatTime(elapsedSeconds)} — stretch break?
              </button>
            )}

            {/* Telemetry Row */}
            <div className="w-full pt-4 mt-3 border-t border-white/10 flex items-center justify-around font-mono text-xs sm:text-sm text-text-secondary">
              <div className="flex flex-col items-center">
                <span
                  className="text-[10px] tracking-widest uppercase mb-0.5 text-text-muted font-bold font-['Rajdhani']"
                >
                  Today&apos;s Subject
                </span>
                <span className="font-bold text-text-primary tabular-nums">
                  {formatTime(initialSubjectSeconds + todayElapsedSeconds)}
                </span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div className="flex flex-col items-center">
                <span
                  className="text-[10px] tracking-widest uppercase mb-0.5 text-text-muted font-bold font-['Rajdhani']"
                >
                  Daily Cumulative
                </span>
                <span className="font-bold text-text-primary tabular-nums">
                  {formatTime(initialTotalSeconds + todayElapsedSeconds)}
                </span>
              </div>
            </div>

            {/* Session Dots */}
            {showSessionDots && (
              <div className="flex gap-2 mt-4 pt-3 border-t border-white/10 justify-center">
                {Array.from({ length: totalSessions }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background:
                        i + 1 < currentSession
                          ? phaseColor
                          : i + 1 === currentSession
                          ? `${phaseColor}`
                          : "rgba(255, 255, 255, 0.2)",
                      boxShadow: i + 1 === currentSession ? `0 0 8px ${phaseColor}` : "none",
                      transition: "all 0.3s ease",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Bottom Action Controls ──────────────── */}
      <div
        className={`w-full flex flex-wrap items-center justify-center gap-3 sm:gap-4 shrink-0 z-10 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] transition-all duration-300 ${
          isDocked ? "max-w-2xl" : ""
        } ${controlsAlignmentClass}`}
      >
        {/* Pause/Resume button */}
        {phase !== "done" && (
          <button
            onClick={onTogglePause}
            className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/15 hover:border-cyan-400/40 shadow-lg text-text-primary cursor-pointer backdrop-blur-md"
          >
            {isPaused ? (
              <>
                <svg className="w-5 h-5 text-cyan-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <span
                  className="text-sm uppercase tracking-wider font-bold"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Resume
                </span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
                <span
                  className="text-sm uppercase tracking-wider font-bold"
                  style={{ fontFamily: "'Rajdhani', sans-serif" }}
                >
                  Pause
                </span>
              </>
            )}
          </button>
        )}

        {/* Flowtime / Free Flow: on-demand break controls */}
        {onTakeFlowBreak && phase === "focus" && remainingSeconds === null && (
          <button
            onClick={onTakeFlowBreak}
            className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 hover:scale-105 active:scale-95 transition-all duration-200 border border-amber-500/40 hover:border-amber-400/60 shadow-lg text-amber-300 cursor-pointer backdrop-blur-md"
          >
            <span
              className="text-sm uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Take a Break
            </span>
          </button>
        )}
        {onSkipFlowBreak && isBreak && (
          <button
            onClick={onSkipFlowBreak}
            className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all duration-200 border border-white/15 hover:border-accent-primary-mid shadow-lg text-text-primary cursor-pointer backdrop-blur-md"
          >
            <span
              className="text-sm uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Skip Break → Focus
            </span>
          </button>
        )}

        {/* End Session */}
        <button
          onClick={onEndSession}
          disabled={isEnding}
          className="flex items-center gap-3 px-7 py-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all duration-200 border border-red-500/30 hover:border-red-500/50 shadow-xl text-red-400 cursor-pointer backdrop-blur-md"
        >
          {isEnding ? (
            <span className="text-base sm:text-lg uppercase tracking-wider font-bold">
              Ending...
            </span>
          ) : (
            <>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span
                className="text-sm sm:text-base uppercase tracking-wider font-bold text-text-primary"
                style={{ fontFamily: "'Rajdhani', sans-serif" }}
              >
                End Session
              </span>
            </>
          )}
        </button>

        {/* Complete Quest (only shown when bound to an active quest) */}
        {questData && onCompleteQuest && (
          <button
            onClick={onCompleteQuest}
            disabled={isEnding}
            className="flex items-center gap-3 px-7 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all duration-200 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.35)] text-white cursor-pointer"
            title="Complete quest and claim XP rewards"
          >
            <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-200" />
            <span
              className="text-sm sm:text-base uppercase tracking-wider font-bold"
              style={{ fontFamily: "'Rajdhani', sans-serif" }}
            >
              Complete Quest
            </span>
          </button>
        )}
      </div>
    </>
  );
});

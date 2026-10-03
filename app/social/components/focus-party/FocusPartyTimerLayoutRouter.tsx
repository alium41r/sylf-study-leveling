"use client";

// ============================================================================
// FocusPartyTimerLayoutRouter — Party-Safe Timer Presentation Adapter
// ============================================================================
// Clean separation of concerns:
//   1. TimerDock: Pure visual appearance & materials from Solo layouts
//   2. FocusPartyTimerPresentationAdapter: Party state -> FocusTimerDockProps
//   3. FocusPartyTimerLayoutRouter: Selects authentic dock layout
//   4. Party safe-zone wrapper: Responsive, collision-free lower dock placement
// ============================================================================

import React, { memo } from "react";
import { formatFocusTime } from "./focus-party-utils";
import {
  FocusTimerPosition,
  FocusTimerLayoutKey,
  normalizeLayoutKey,
  resolveEffectiveTimerPosition,
} from "@/lib/focus-background-types";
import { FocusBackgroundClient } from "@/lib/focus-background-client";
import type { FocusTimerState } from "@/lib/focus-party-types";
import {
  FocusTimerDockProps,
  PrimaryTimerAction,
} from "@/app/focus/components/layouts/FocusTimerDockProps";
import { ClassicTimerDock } from "@/app/focus/components/layouts/ClassicTimerLayout";
import { AnimeTimerDock } from "@/app/focus/components/layouts/AnimeTimerLayout";
import { LandscapeTimerDock } from "@/app/focus/components/layouts/LandscapeTimerLayout";
import { FantasyTimerDock } from "@/app/focus/components/layouts/FantasyTimerLayout";

export interface FocusPartyTimerLayoutProps {
  myTimerState: FocusTimerState;
  myLiveSeconds: number;
  isActionLoading: boolean;
  onAction: () => Promise<void>;
  layoutKey?: string | null;
  background?: FocusBackgroundClient | null;
}

/**
 * Resolves the concrete docking position for Focus Party timer layouts.
 *
 * Constrains requested positions to the lower Party safe zone:
 * - 'classic' & 'landscape' always resolve to lower-center.
 * - 'anime' & 'fantasy' can leverage lower-left or lower-right margins on
 *   desktop (md+) to use negative space opposite the artwork focal point.
 * - Viewports < md always dock to lower-center to prevent collision with
 *   the 2-column or 4-column member cards.
 */
export function resolvePartySafeTimerPosition(
  requestedPosition: FocusTimerPosition | string | null | undefined,
  focalX: number | null | undefined,
  layoutKey: FocusTimerLayoutKey
): "left" | "right" | "center" {
  if (layoutKey === "classic" || layoutKey === "landscape") {
    return "center";
  }
  return resolveEffectiveTimerPosition(requestedPosition, focalX);
}

// ── FocusPartyTimerPresentationAdapter ────────────────────────────────────────
// Pure presentational adapter that translates Party state into the shared
// FocusTimerDockProps contract without passing any Solo-specific concepts
// (Pomodoro authority, Flowtime, Quests, daily totals machinery).
export interface FocusPartyTimerPresentationAdapterProps extends FocusPartyTimerLayoutProps {
  layoutKey: FocusTimerLayoutKey;
  children: (dockProps: FocusTimerDockProps) => React.ReactElement;
}

export const FocusPartyTimerPresentationAdapter = memo(function FocusPartyTimerPresentationAdapter({
  myTimerState,
  myLiveSeconds,
  isActionLoading,
  onAction,
  layoutKey,
  children,
}: FocusPartyTimerPresentationAdapterProps) {
  const isFocusing = myTimerState === "FOCUSING";
  const isPaused = myTimerState === "PAUSED";
  const isNotStarted = myTimerState === "NOT_STARTED";

  // Semantic status colors & labels (preserving theme tokens vs timer state distinction)
  const phaseColor = isFocusing ? "#34d399" : isPaused ? "#f59e0b" : "#94a3b8";
  const phaseLabel = isFocusing ? "FOCUSING" : isPaused ? "PAUSED" : "NOT STARTED";

  // Party Action Semantics: Only real Party actions (Start Focus / Pause / Resume)
  const primaryAction: PrimaryTimerAction = {
    label: isNotStarted ? "Start Focus" : isPaused ? "Resume" : "Pause",
    icon: isNotStarted || isPaused ? "play" : "pause",
    onClick: onAction,
    isLoading: isActionLoading,
    disabled: isActionLoading,
    testId: isFocusing ? "pause-timer-btn" : isPaused ? "resume-timer-btn" : "start-timer-btn",
  };

  // Celestial/horology ticks & progress: 60-second sweep during active focus
  const activeSecond = Math.max(0, Math.floor(myLiveSeconds)) % 60;
  const progressPercent = ((Math.max(0, Math.floor(myLiveSeconds)) % 60) / 60) * 100;

  const dockProps: FocusTimerDockProps = {
    formattedDisplayTime: formatFocusTime(myLiveSeconds),
    phaseColor,
    phaseLabel,
    isPaused,
    pauseReason: isPaused ? "manual" : undefined,
    isFocusing,
    isNotStarted,
    progressPercent,
    activeSecond,
    isCountdown: false,
    primaryAction,
    density: "compact",
    context: "party",
    testId: `party-timer-dock-${layoutKey}`,
  };

  return children(dockProps);
});

// ── Main Layout Router ────────────────────────────────────────────────────────
export const FocusPartyTimerLayoutRouter = memo(function FocusPartyTimerLayoutRouter(
  props: FocusPartyTimerLayoutProps
) {
  const normKey = normalizeLayoutKey(props.layoutKey);

  // Determine Party-safe docking alignment
  const safePosition = resolvePartySafeTimerPosition(
    props.background?.timerPosition,
    props.background?.focalX,
    normKey
  );

  const alignmentClass =
    safePosition === "left"
      ? "md:self-start md:ml-8 lg:md:ml-16"
      : safePosition === "right"
      ? "md:self-end md:mr-8 lg:md:mr-16"
      : "self-center";

  return (
    <div
      data-testid="focus-party-timer-router"
      className={`w-full mt-auto pb-3 sm:pb-5 px-4 flex flex-col items-center z-20 pointer-events-auto transition-all duration-300 ${alignmentClass}`}
    >
      <FocusPartyTimerPresentationAdapter {...props} layoutKey={normKey}>
        {(dockProps) => {
          switch (normKey) {
            case "anime":
              return <AnimeTimerDock {...dockProps} />;
            case "landscape":
              return <LandscapeTimerDock {...dockProps} />;
            case "fantasy":
              return <FantasyTimerDock {...dockProps} />;
            case "classic":
            default:
              return <ClassicTimerDock {...dockProps} />;
          }
        }}
      </FocusPartyTimerPresentationAdapter>
    </div>
  );
});

// ============================================================================
// Focus Timer Layout Preview Adapter (Phase 6.1)
// ============================================================================
// Renders a high-fidelity, scaled preview of the real selected Timer Layout
// within a 16:9 artwork container (e.g. Edit Environment in Settings).
//
// INVARIANTS:
// 1. Purely visual: NEVER connects to timer engine, session accounting, or DB.
// 2. Safe and inert: aria-hidden="true" and inert={true} so preview buttons
//    never enter modal tab order or accessibility tree.
// 3. Pointer-events-none: Clicks pass through directly to underlying artwork
//    (focal-point repositioning remains 100% interactive).
// 4. Viewport scaling: Renders a virtual 1280×720 desktop canvas and scales it
//    via CSS transform to fit any host container (desktop, tablet, or mobile).
// ============================================================================
"use client";

import React, { memo, useRef, useState, useEffect } from "react";
import { FocusTimerLayoutRouter } from "./FocusTimerLayoutRouter";
import { FocusTimerLayoutProps } from "./FocusTimerLayoutProps";
import {
  FocusTimerPosition,
  FocusTimerLayoutKey,
  normalizeLayoutKey,
} from "@/lib/focus-background-types";

export interface FocusTimerLayoutPreviewProps {
  layoutKey: FocusTimerLayoutKey | string;
  timerPosition: FocusTimerPosition;
  focalX?: number | null;
  focalY?: number | null;
  subjectName?: string;
  formattedTime?: string;
  className?: string;
}

const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 720;

// Deterministic formatTime helper (no timer engine dependency)
function previewFormatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const FocusTimerLayoutPreview = memo(function FocusTimerLayoutPreview({
  layoutKey,
  timerPosition,
  focalX = 0.5,
  focalY = 0.5,
  subjectName = "Study Session",
  formattedTime = "25:00",
  className = "",
}: FocusTimerLayoutPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(0.5);
  const [isMeasured, setIsMeasured] = useState<boolean>(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      if (el.clientWidth > 0) {
        setScale(el.clientWidth / VIRTUAL_WIDTH);
        setIsMeasured(true);
      }
    };

    updateScale();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(updateScale);
      ro.observe(el);

      return () => {
        ro.disconnect();
      };
    }
  }, []);

  const normalizedKey = normalizeLayoutKey(layoutKey);

  // Category-specific theme accent colors
  const phaseColors: Record<string, string> = {
    classic: "#6366f1", // Indigo
    anime: "#ec4899",   // Pink
    landscape: "#f59e0b", // Amber
    fantasy: "#a855f7", // Purple
  };

  const currentPhaseColor = phaseColors[normalizedKey] || "#6366f1";

  // Static, deterministic preview props (no timer engine, no interval, no mutations)
  const previewProps: FocusTimerLayoutProps = {
    formattedDisplayTime: formattedTime,
    elapsedSeconds: 0,
    breakSeconds: 0,
    remainingSeconds: 1500,
    isCountdown: true,
    isBreak: false,
    phase: "focus",
    phaseColor: currentPhaseColor,
    phaseLabel: "FOCUS",
    modeDisplayName: "Pomodoro",
    subjectName: subjectName,
    questData: null,
    initialSubjectSeconds: 0,
    initialTotalSeconds: 3600, // 1 hr daily study representative value
    currentSession: 1,
    totalSessions: 4,
    showSessionDots: true,
    isPaused: false,
    pauseReason: "manual",
    isEnding: false,
    endError: null,
    flowNudge: false,
    onTogglePause: () => {},
    onEndSession: () => {},
    onCompleteQuest: () => {},
    onTakeFlowBreak: () => {},
    onSkipFlowBreak: () => {},
    background: {
      id: -1,
      categoryId: 1,
      name: "Preview",
      storagePath: "",
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT,
      aspectRatio: 16 / 9,
      focalX: focalX ?? 0.5,
      focalY: focalY ?? 0.5,
      timerPosition: timerPosition ?? "auto",
      sortOrder: 0,
      isActive: true,
      publicUrl: "",
    },
    category: {
      id: 1,
      name: "Custom",
      slug: "custom",
      layoutKey: normalizedKey,
      sortOrder: 0,
      isActive: true,
      backgrounds: [],
    },
    layoutKey: normalizedKey,
    formatTime: previewFormatTime,
    isPreview: true, // Forces layout to render intended desktop composition regardless of host screen width
  };

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      inert={true}
      tabIndex={-1}
      className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-10 ${className}`}
      data-testid="focus-timer-layout-preview"
      data-layout-key={normalizedKey}
      data-timer-position={timerPosition}
    >
      {(isMeasured || scale > 0) && (
        <div
          style={{
            width: `${VIRTUAL_WIDTH}px`,
            height: `${VIRTUAL_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
          className="flex flex-col justify-between"
        >
          <FocusTimerLayoutRouter {...previewProps} />
        </div>
      )}
    </div>
  );
});

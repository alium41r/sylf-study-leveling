// ============================================================================
// Focus Background Rendering Engine (Phase 2)
// ============================================================================
// Renders the active Focus Environment:
//   - Classic Sylf: Authentic phase-responsive radial gradients
//   - Image Background: Crossfading cover wallpaper with focal-point alignment
//     and restrained readability vignettes ensuring timer controls pop.
// Stacking rule: Rendered at `absolute inset-0 z-0 pointer-events-none`.
// ============================================================================
"use client";

import React, { memo, useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { FocusBackgroundClient } from "@/lib/focus-background-client";
import { TimerPhase, isBreakPhase } from "@/lib/timer-engine";
import { resolveEffectiveTimerPosition } from "@/lib/focus-background-types";

interface FocusBackgroundRendererProps {
  activeBackground: FocusBackgroundClient | null;
  isClassic: boolean;
  phase: TimerPhase;
  layoutKey?: string;
  onImageError?: (message: string) => void;
}

export const FocusBackgroundRenderer = memo(function FocusBackgroundRenderer({
  activeBackground,
  isClassic,
  phase,
  layoutKey = "classic",
  onImageError,
}: FocusBackgroundRendererProps) {
  const isBreak = isBreakPhase(phase);
  const imageUrl = (activeBackground as any)?.signedUrl || activeBackground?.publicUrl;
  const shouldReduceMotion = useReducedMotion();
  const [imageFailed, setImageFailed] = useState(false);

  // Reset runtime image load failure state whenever image URL changes
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  // ─── 1. Classic Sylf Mode (or no valid image URL / load failure fallback) ─
  if (isClassic || !activeBackground || !imageUrl || imageFailed) {
    const classicGradient = isBreak
      ? "radial-gradient(ellipse at center, rgba(34, 197, 94, 0.08) 0%, var(--bg-void) 75%)"
      : "radial-gradient(ellipse at center, var(--accent-primary-dim) 0%, var(--bg-void) 75%)";

    return (
      <div
        className="absolute inset-0 z-0 pointer-events-none overflow-hidden transition-colors duration-700 bg-bg-void"
        aria-hidden="true"
        data-testid="focus-bg-classic"
      >
        <div
          className="absolute inset-0 transition-all duration-700"
          style={{ background: classicGradient }}
        />
      </div>
    );
  }

  // ─── 2. Image Background Mode ──────────────────────────────────────
  const focalX = typeof activeBackground.focalX === "number" ? activeBackground.focalX : 0.5;
  const focalY = typeof activeBackground.focalY === "number" ? activeBackground.focalY : 0.5;
  const imageKey = ((activeBackground as any)?.source ? `${(activeBackground as any).source}-` : "") + activeBackground.id;

  // Resolve docking position for localized contrast shadow
  const effectivePosition = resolveEffectiveTimerPosition(
    activeBackground.timerPosition,
    activeBackground.focalX
  );
  const glowOrigin =
    effectivePosition === "right"
      ? "80% 50%"
      : effectivePosition === "left"
      ? "20% 50%"
      : "center";

  // Transition duration respects user's motion preferences
  const transitionDuration = shouldReduceMotion ? 0 : 0.35;

  return (
    <div
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-bg-void select-none"
      aria-hidden="true"
      data-testid="focus-bg-image"
      data-layout-key={layoutKey}
    >
      {/* Simultaneous Crossfading Background Wallpaper Container */}
      <AnimatePresence initial={false}>
        <motion.div
          key={imageKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: transitionDuration, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={activeBackground.name}
            className="w-full h-full object-cover transition-all"
            style={{
              objectPosition: `${focalX * 100}% ${focalY * 100}%`,
            }}
            loading="eager"
            decoding="async"
            onError={() => {
              console.warn(`[FocusBackgroundRenderer] Failed to load background image "${activeBackground.name}". Showing ambient backdrop.`);
              setImageFailed(true);
              onImageError?.(`Unable to display "${activeBackground.name}". Showing ambient backdrop.`);
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* ─── Restrained Readability Layers ──────────────────────────── */}
      {/* 1. Subtle global vignette keeping edges atmospheric */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(10, 12, 16, 0.15) 0%, rgba(10, 12, 16, 0.65) 100%)",
        }}
      />

      {/* 2. Top & Bottom gradient ramps ensuring badges and controls pop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(5, 7, 10, 0.45) 0%, transparent 22%, transparent 78%, rgba(5, 7, 10, 0.55) 100%)",
        }}
      />

      {/* 3. Localized backdrop contrast glow behind digital timer digits */}
      <div
        className="absolute inset-0 transition-all duration-500"
        style={{
          background: isBreak
            ? `radial-gradient(circle at ${glowOrigin}, rgba(34, 197, 94, 0.12) 0%, rgba(0, 0, 0, 0.28) 45%, transparent 75%)`
            : `radial-gradient(circle at ${glowOrigin}, rgba(0, 0, 0, 0.38) 0%, rgba(0, 0, 0, 0.22) 45%, transparent 75%)`,
        }}
      />
    </div>
  );
});

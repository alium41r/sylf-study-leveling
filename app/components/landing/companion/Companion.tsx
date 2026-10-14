"use client";
import { memo, useEffect, useId, useRef, type CSSProperties } from "react";
import { CompanionArt } from "./artwork";
import type { EyeExpression } from "./MagicalEyes";
import {
  COMPANION_SIZES,
  presentationFor,
  type Action,
  type Expression,
  type CompanionReaction,
  type CompanionSize,
  type CompanionState,
} from "./model";
import { useCompanionState } from "./useCompanionState";
import styles from "./Companion.module.css";

export type SvgSequenceBeat = "idle" | "blink" | "notice" | "happy" | "return";

export interface CompanionProps {
  state?: CompanionState;
  size?: CompanionSize;
  reaction?: CompanionReaction;
  motion?: "full" | "quiet" | "none";
  /**
   * Landing journey only. Gates the intensified ambient idle motion, faster
   * expression cadence and layered float so that other consumers of this
   * canonical renderer (onboarding) keep their current quieter presentation.
   */
  motionProfile?: "journey";
  className?: string;
  /** Temporary dev comparison; SVG reference studies opt out. */
  allowPixelPreview?: boolean;
  /** Development SVG capability review only; never applied to raster previews. */
  svgSequenceBeat?: SvgSequenceBeat;
  /** Temporary review or sustained landing-section presentation. */
  preview?: {
    expression: Expression;
    action: Action;
    eyeExpression?: EyeExpression;
  };
}

/** The single canonical companion. No user identity, palette, rewards or timer logic. */
export const Companion = memo(function Companion({
  state = "IDLE",
  size = "MEDIUM",
  reaction,
  motion = "full",
  motionProfile,
  className = "",
  preview,
  svgSequenceBeat,
}: CompanionProps) {
  const pixelPreview = false;
  const sequence =
    process.env.NODE_ENV === "development" && !pixelPreview
      ? svgSequenceBeat
      : undefined;
  const host = useRef<HTMLSpanElement>(null);
  const id = `sylf-${useId().replace(/:/g, "")}`;
  const shown = useCompanionState(state, reaction);
  const { expression, action } = preview ?? presentationFor(shown);
  const pixels =
    typeof size === "number"
      ? Math.max(24, Math.min(size, 640))
      : COMPANION_SIZES[size];
  useEffect(() => {
    const element = host.current!;
    let visible = true;
    const update = () => {
      element.dataset.animation =
        visible && !document.hidden ? "active" : "paused";
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            update();
          });
    observer?.observe(element);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <span
      ref={host}
      aria-hidden="true"
      data-sylf-companion={pixelPreview ? "pixel" : "original"}
      data-state={shown}
      data-expression={expression}
      data-action={action}
      data-motion={
        pixelPreview
          ? "none"
          : motion === "full" && state === "FOCUSING"
            ? "quiet"
            : motion
      }
      data-motion-profile={motionProfile}
      data-svg-sequence={sequence}
      data-compact={pixels <= 64}
      className={`${styles.companion} ${className} `}
      style={{ "--companion-size": `${pixels}px` } as CSSProperties}
    >
        <CompanionArt
          id={id}
          expression={expression}
          action={action}
          eyeExpression={preview?.eyeExpression}
          blink={sequence ? sequence === "blink" : undefined}
          jointSeams={motionProfile === "journey"}
        />
    </span>
  );
});
export default Companion;

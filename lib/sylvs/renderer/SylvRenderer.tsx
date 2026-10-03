import React from "react";
import { SYLV_CANVAS_HEIGHT, SYLV_CANVAS_WIDTH, SYLV_VIEWBOX } from "../anchors";
import { getDefaultColors, resolveSylvCssVariables } from "../colors";
import { SylvAnchorKey, SylvAppearance } from "../types";
import { AnchorOverlay } from "./AnchorOverlay";
import { FemaleBase } from "./FemaleBase";
import { MaleBase } from "./MaleBase";

export interface SylvSlotOverrides {
  backgroundEffects?: React.ReactNode;
  hairBack?: React.ReactNode;
  appendagesBack?: React.ReactNode;
  clothingBack?: React.ReactNode;
  tail?: React.ReactNode;
  body?: React.ReactNode;
  arms?: React.ReactNode;
  head?: React.ReactNode;
  ears?: React.ReactNode;
  eyes?: React.ReactNode;
  markings?: React.ReactNode;
  clothingFront?: React.ReactNode;
  armor?: React.ReactNode;
  hairFront?: React.ReactNode;
  headAccessory?: React.ReactNode;
  neckAccessory?: React.ReactNode;
  floatingAccessory?: React.ReactNode;
  foregroundEffects?: React.ReactNode;
}

export interface SylvRendererProps {
  appearance: SylvAppearance;
  /** Primary width/height dimension helper. Defaults to full or auto. */
  size?: number | string;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  /** Whether to render the visual anchor overlay for debugging/alignment */
  showAnchors?: boolean;
  selectedAnchor?: SylvAnchorKey | null;
  onSelectAnchor?: (key: SylvAnchorKey) => void;
  showCoordinates?: boolean;
  showGrid?: boolean;
  /** Modular component slot overrides for future phases */
  slots?: SylvSlotOverrides;
  ariaLabel?: string;
}

/**
 * Modular SVG Character Renderer for Sylvs.
 * Assembles layered anatomy, cosmetics, equipment, and effects.
 */
export const SylvRenderer: React.FC<SylvRendererProps> = ({
  appearance,
  size,
  width,
  height,
  className,
  style,
  showAnchors = false,
  selectedAnchor,
  onSelectAnchor,
  showCoordinates = true,
  showGrid = true,
  slots = {},
  ariaLabel,
}) => {
  const gender = appearance.gender || "male";
  const defaultColors = getDefaultColors(gender);
  const effectiveColors = {
    ...defaultColors,
    ...(appearance.colors || {}),
  };

  const dynamicCssVars = resolveSylvCssVariables(effectiveColors);

  // Compute responsive sizing
  const computedWidth = width ?? (size ? size : "100%");
  const computedHeight =
    height ??
    (typeof size === "number"
      ? Math.round((size * SYLV_CANVAS_HEIGHT) / SYLV_CANVAS_WIDTH)
      : undefined);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={SYLV_VIEWBOX}
      width={computedWidth}
      height={computedHeight}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel || `${gender} Sylv companion`}
      style={
        {
          ...dynamicCssVars,
          ...style,
          display: "block",
          overflow: "visible",
        } as React.CSSProperties
      }
    >
      {/* 1. Global Gradient & Filter Definitions */}
      <defs>
        <radialGradient id="sylv-ambient-glow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stopColor="var(--sylv-glow)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--sylv-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 2. Layer: Background Aura & Effects */}
      <g id="sylv-layer-effects-bg">
        {slots.backgroundEffects}
      </g>

      {/* 3. Layer: Back Hair */}
      <g id="sylv-layer-hair-back">
        {slots.hairBack}
      </g>

      {/* 4. Layer: Back Appendages (Wings, Fins) */}
      <g id="sylv-layer-appendages-back">
        {slots.appendagesBack}
      </g>

      {/* 5. Layer: Back Clothing (Capes, Cloaks) */}
      <g id="sylv-layer-clothing-back">
        {slots.clothingBack}
      </g>

      {/* 6. Layer: Core Base Anatomy (Tail, Body, Arms, Head, Ears, Eyes) */}
      <g id="sylv-layer-base">
        {gender === "female" ? (
          <FemaleBase />
        ) : (
          <MaleBase />
        )}

        {/* Slot overrides for modular anatomy swaps */}
        {slots.tail && <g id="sylv-slot-tail">{slots.tail}</g>}
        {slots.body && <g id="sylv-slot-body">{slots.body}</g>}
        {slots.arms && <g id="sylv-slot-arms">{slots.arms}</g>}
        {slots.head && <g id="sylv-slot-head">{slots.head}</g>}
        {slots.ears && <g id="sylv-slot-ears">{slots.ears}</g>}
        {slots.eyes && <g id="sylv-slot-eyes">{slots.eyes}</g>}
      </g>

      {/* 7. Layer: Markings & Runes */}
      <g id="sylv-layer-markings">
        {slots.markings}
      </g>

      {/* 8. Layer: Front Clothing */}
      <g id="sylv-layer-clothing-front">
        {slots.clothingFront}
      </g>

      {/* 9. Layer: Armor */}
      <g id="sylv-layer-armor">
        {slots.armor}
      </g>

      {/* 10. Layer: Front Hair */}
      <g id="sylv-layer-hair-front">
        {slots.hairFront}
      </g>

      {/* 11. Layer: Head Accessories */}
      <g id="sylv-layer-acc-head">
        {slots.headAccessory}
      </g>

      {/* 12. Layer: Neck Accessories */}
      <g id="sylv-layer-acc-neck">
        {slots.neckAccessory}
      </g>

      {/* 13. Layer: Floating Accessories */}
      <g id="sylv-layer-acc-floating">
        {slots.floatingAccessory}
      </g>

      {/* 14. Layer: Foreground Effects & Sparkles */}
      <g id="sylv-layer-effects-fg">
        {slots.foregroundEffects}
      </g>

      {/* 15. Debug Anchor Overlay */}
      {showAnchors && (
        <AnchorOverlay
          visible={showAnchors}
          selectedAnchor={selectedAnchor}
          onSelectAnchor={onSelectAnchor}
          showCoordinates={showCoordinates}
          showGrid={showGrid}
        />
      )}
    </svg>
  );
};

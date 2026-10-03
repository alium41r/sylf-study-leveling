import React from "react";
import { SYLV_ANCHOR_LIST, SYLV_CANVAS_HEIGHT, SYLV_CANVAS_WIDTH } from "../anchors";
import { SylvAnchorKey } from "../types";

export interface AnchorOverlayProps {
  visible?: boolean;
  selectedAnchor?: SylvAnchorKey | null;
  onSelectAnchor?: (key: SylvAnchorKey) => void;
  showCoordinates?: boolean;
  showGrid?: boolean;
}

export const AnchorOverlay: React.FC<AnchorOverlayProps> = ({
  visible = true,
  selectedAnchor,
  onSelectAnchor,
  showCoordinates = true,
  showGrid = true,
}) => {
  if (!visible) return null;

  return (
    <g id="sylv-debug-anchor-overlay" style={{ pointerEvents: "all" }}>
      {/* Light Coordinate Grid */}
      {showGrid && (
        <g id="sylv-grid" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1" strokeDasharray="4 4">
          {/* Vertical center axis */}
          <line x1={SYLV_CANVAS_WIDTH / 2} y1="0" x2={SYLV_CANVAS_WIDTH / 2} y2={SYLV_CANVAS_HEIGHT} stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" />
          {/* Horizontal center axis */}
          <line x1="0" y1={SYLV_CANVAS_HEIGHT / 2} x2={SYLV_CANVAS_WIDTH} y2={SYLV_CANVAS_HEIGHT / 2} stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" />
          {/* Horizontal reference bands */}
          <line x1="0" y1="133" x2={SYLV_CANVAS_WIDTH} y2="133" />
          <line x1="0" y1="175" x2={SYLV_CANVAS_WIDTH} y2="175" />
          <line x1="0" y1="295" x2={SYLV_CANVAS_WIDTH} y2="295" />
          <line x1="0" y1="375" x2={SYLV_CANVAS_WIDTH} y2="375" />
          <line x1="0" y1="555" x2={SYLV_CANVAS_WIDTH} y2="555" />
        </g>
      )}

      {/* Anchor Markers */}
      <g id="sylv-anchors-group">
        {SYLV_ANCHOR_LIST.map((anchor) => {
          const isSelected = selectedAnchor === anchor.key;
          const { x, y } = anchor.point;
          const isAccessory = anchor.key.includes("ACCESSORY");

          const primaryColor = isSelected
            ? "#F59E0B"
            : isAccessory
            ? "#A855F7"
            : "#38BDF8";

          return (
            <g
              key={anchor.key}
              id={`anchor-${anchor.key}`}
              cursor="pointer"
              onClick={() => onSelectAnchor?.(anchor.key)}
            >
              {/* Outer pulsing ring for selected */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r="9"
                  fill="none"
                  stroke={primaryColor}
                  strokeWidth="2"
                  opacity="0.8"
                />
              )}

              {/* Anchor Target Reticle */}
              <circle
                cx={x}
                cy={y}
                r="4.5"
                fill={primaryColor}
                stroke="#FFFFFF"
                strokeWidth="1.5"
              />

              {/* Anchor Label */}
              <g transform={`translate(${x + 7}, ${y - 4})`}>
                <rect
                  x="0"
                  y="-8"
                  width={showCoordinates ? anchor.key.length * 5.8 + 52 : anchor.key.length * 5.8 + 12}
                  height="14"
                  rx="3"
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke={primaryColor}
                  strokeWidth="0.8"
                />
                <text
                  x="4"
                  y="2.5"
                  fill="#F8FAFC"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="600"
                  style={{ userSelect: "none" }}
                >
                  {anchor.key}
                  {showCoordinates && ` (${x},${y})`}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </g>
  );
};

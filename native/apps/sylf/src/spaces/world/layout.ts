// Where the lobby's art sits for a window. Pure, so every window size can be tested without a renderer.
import { GATE_ANCHORS, PLATE_SIZES } from "./art/plates.generated";

export interface SceneLayout {
  sea: { x: number; y: number; width: number; height: number };
  gate: { x: number; y: number; width: number; height: number };
  /** The middle of the gate's opening, in window coordinates: the point the walk through it heads for. */
  threshold: { x: number; y: number };
  horizon: number;
}

/** How far down the sea plate its clouds begin and where its flat base starts, which stays below the window, and the height on the gate plate that meets them. */
const SEA_TOP = 0.2;
const SEA_FLOOR = 0.86;
const GATE_FOOT = 0.84;

export function sceneLayout(width: number, height: number, compact: boolean): SceneLayout {
  const horizon = compact ? height * 0.6 : height - Math.min(height * 0.24, 190);
  const seaRatio = PLATE_SIZES.sea.width / PLATE_SIZES.sea.height;
  // Always a little wider than the window, so the sea can shift with the pointer and never show its ends.
  const seaHeight = Math.max((height - horizon) / (SEA_FLOOR - SEA_TOP), (width * 1.1) / seaRatio);
  const seaWidth = seaHeight * seaRatio;
  const sea = { x: (width - seaWidth) / 2, y: horizon - seaHeight * SEA_TOP, width: seaWidth, height: seaHeight };

  const gateRatio = PLATE_SIZES.gate.width / PLATE_SIZES.gate.height;
  const roomAbove = compact ? horizon - height * 0.22 : horizon - 12;
  const widest = width * (compact ? 0.86 : width < 1000 ? 0.56 : 0.5);
  const gateHeight = Math.min(roomAbove / GATE_FOOT, widest / gateRatio);
  const gateWidth = gateHeight * gateRatio;
  const gate = { x: (compact ? width * 0.5 : width * 0.7) - gateWidth * GATE_ANCHORS.threshold.x, y: horizon - gateHeight * GATE_FOOT, width: gateWidth, height: gateHeight };
  return { sea, gate, horizon, threshold: { x: gate.x + gateWidth * GATE_ANCHORS.threshold.x, y: gate.y + gateHeight * GATE_ANCHORS.threshold.y } };
}

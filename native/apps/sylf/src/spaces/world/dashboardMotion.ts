// How the dashboard's island moves, worked out apart from the art so it is tested without a renderer. Everything is a short, slow swing back and forth
// (never a loop with a seam), a few pixels at most, and only transform or opacity, so the platform's compositor can run all of it with no JavaScript
// between frames. A stepped theme moves one whole pixel per step, which turns the same swing into a pixel-art gesture.
export interface Swing {
  /** Pixels of travel, already scaled by the person's animation intensity. */
  distance: number;
  /** One way, in milliseconds. The animation alternates, so a full swing is twice this. */
  duration: number;
  /** Whole steps along the way for a stepped theme, or 0 for a smooth swing. */
  steps: number;
}

export interface IslandMotion {
  /** The gate and its dais, rising and settling. */
  float: Swing;
  /** The nearer and the farther cloud, drifting sideways at different speeds. */
  cloudNear: Swing;
  cloudFar: Swing;
  /** The sea of cloud in front, swaying under the dais. */
  sea: Swing;
  /** The light in the gate's opening: how far it dims, as a share of its resting strength. */
  glow: { low: number; duration: number; steps: number };
}

const BASE = { float: { distance: 4, duration: 6_800 }, cloudNear: { distance: 22, duration: 46_000 }, cloudFar: { distance: 12, duration: 64_000 }, sea: { distance: 9, duration: 19_000 } } as const;
const GLOW = { low: 0.62, duration: 4_200, steps: 4 } as const;

/**
 * `amount` is the theme's resolved animation amount (0 with reduced motion or the Still intensity), and `steps` its frames per second when it is a stepped
 * theme. Null means nothing moves at all: no animation is created, so there is nothing to pause.
 */
export function islandMotion(amount: number, steps: number): IslandMotion | null {
  if (!(amount > 0)) return null;
  const scale = Math.min(amount, 1.4);
  const swing = ({ distance, duration }: { distance: number; duration: number }): Swing => {
    const travel = Math.max(1, Math.round(distance * scale));
    return { distance: travel, duration, steps: steps > 0 ? travel : 0 };
  };
  return { float: swing(BASE.float), cloudNear: swing(BASE.cloudNear), cloudFar: swing(BASE.cloudFar), sea: swing(BASE.sea), glow: { low: GLOW.low, duration: GLOW.duration, steps: steps > 0 ? GLOW.steps : 0 } };
}

/** The scene's proportions, as fractions of its box. The sky is a window in the lower part, and the gate's roof rises out of its top edge. */
export const ISLAND_FRAME = { skyTop: 0.3, gateHeight: 0.98, gateBottom: -0.02, /** The sea plate's lowest sixth is empty, so it sits a little below the window. */ seaBottom: -0.1 } as const;

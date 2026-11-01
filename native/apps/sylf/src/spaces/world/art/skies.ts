// How each sky reads on screen. World's art is authored, like a document: its colors come from the owner's visual direction and never
// follow a theme, which is the one reason hex values are allowed here. `ground` is what the interface is solved against, so
// someone's own theme, type, Marker and accent all carry into the sky with their contrast intact.
import type { Polarity } from "@sylf/design-system";
import type { WorldSky } from "@sylf/spaces";

export interface SkyStyle {
  /** The interface's ground: close to the sky behind the lobby's text. */
  ground: string;
  polarity: Polarity;
  /** What the gate's light fills the window with on the way through. */
  bloom: string;
  petal: string;
  petals: number;
  /** How strongly the opening and the lanterns glow in this light. */
  threshold: number;
  lantern: number;
  stars: boolean;
  /** How strongly the far clouds show. They pass behind the title, so dark skies keep them quiet. */
  clouds: number;
  /** Top, horizon and bottom, for the sky's swatch in Preparations. */
  swatch: [string, string, string];
}

export const SKY_STYLES: Record<WorldSky, SkyStyle> = {
  dawn: { ground: "#e7dfe8", polarity: "light", bloom: "#fff3e2", petal: "#f3b6c9", petals: 12, threshold: 0.5, lantern: 0.3, stars: false, clouds: 1, swatch: ["#cfd6ec", "#fbe2cd", "#d3d9ec"] },
  day: { ground: "#c4dcf6", polarity: "light", bloom: "#f4f9ff", petal: "#f6bfd0", petals: 10, threshold: 0.32, lantern: 0.12, stars: false, clouds: 1, swatch: ["#9fc8f2", "#d8ebfb", "#e7f1fb"] },
  sunset: { ground: "#d6bfe4", polarity: "light", bloom: "#fff0cf", petal: "#f4a9c0", petals: 14, threshold: 0.58, lantern: 0.5, stars: false, clouds: 1, swatch: ["#aaa5de", "#fbdcb4", "#d6b5d9"] },
  dusk: { ground: "#4b4380", polarity: "dark", bloom: "#ffdcc4", petal: "#e596b4", petals: 10, threshold: 0.62, lantern: 0.72, stars: false, clouds: 0.5, swatch: ["#54508f", "#c790a6", "#7f6ca4"] },
  night: { ground: "#131d4c", polarity: "dark", bloom: "#ffe9c2", petal: "#c98fb6", petals: 8, threshold: 0.72, lantern: 0.95, stars: true, clouds: 0.7, swatch: ["#0d163c", "#22306e", "#2f3d7c"] },
  mist: { ground: "#c6d1dc", polarity: "light", bloom: "#f4f6f9", petal: "#e8bccb", petals: 6, threshold: 0.3, lantern: 0.34, stars: false, clouds: 1, swatch: ["#aebccd", "#d3dbe4", "#dbe2e9"] },
};

/** Fixed positions, as fractions of the window, kept to the upper sky. */
export const STARS = [
  [0.04, 0.08, 2], [0.09, 0.3, 1], [0.13, 0.15, 2], [0.18, 0.44, 1], [0.22, 0.06, 1], [0.27, 0.24, 2], [0.31, 0.5, 1], [0.35, 0.12, 2], [0.39, 0.36, 1], [0.43, 0.05, 1],
  [0.47, 0.22, 2], [0.5, 0.46, 1], [0.54, 0.1, 1], [0.58, 0.3, 2], [0.62, 0.05, 1], [0.66, 0.18, 1], [0.7, 0.08, 2], [0.75, 0.26, 1], [0.79, 0.04, 2], [0.83, 0.16, 1],
  [0.87, 0.34, 2], [0.9, 0.1, 1], [0.94, 0.24, 2], [0.97, 0.44, 1], [0.02, 0.4, 1], [0.15, 0.56, 1], [0.34, 0.6, 1], [0.92, 0.55, 1],
] as const;
export const STAR_COLOR = "#e3e8ff";

// The personality axes. A theme is a point in this space, not a palette: each axis is independent, so a user can take
// Voxel's corners with Student's typography. Layout structure and navigation are deliberately NOT an axis — every theme
// keeps the same hierarchy, placement and behavior, which is what keeps navigation consistent across personalities.
import type { Presence } from "../color/palette";
import type { FontId } from "./fonts";

export type ShapeId = "soft" | "precise" | "sigil" | "block" | "pillow" | "folio";
export type MaterialId = "aloft" | "hairline" | "inlay" | "extruded" | "plush" | "paper";
export type MarkerId = "mote" | "bar" | "rune" | "voxel" | "bead" | "rule";
export type DensityId = "compact" | "comfortable" | "spacious";
export type MotionId = "glide" | "crisp" | "mystic" | "stepped" | "bounce" | "turn";
export type IntensityId = "still" | "subtle" | "standard" | "expressive";
export type RampId = "editorial" | "tight" | "ceremonial" | "arcade" | "friendly" | "book";
export type IconStyleId = "square" | "butt" | "fine" | "chunky" | "round" | "pen";

export interface ThemeAxes {
  accentHex: string;
  groundDay: string;
  groundNight: string;
  presence: Presence;
  fontVoice: FontId;
  fontInterface: FontId;
  fontInstrument: FontId;
  ramp: RampId;
  shape: ShapeId;
  material: MaterialId;
  marker: MarkerId;
  density: DensityId;
  motion: MotionId;
  intensity: IntensityId;
  icons: IconStyleId;
}

export interface ShapeTokens {
  label: string;
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; full: number };
  /** Transient surfaces sharpen the corner that points back to their origin. */
  tuck: boolean;
  corner: "round" | "ornament" | "pixel";
}

export const SHAPES: Record<ShapeId, ShapeTokens> = {
  soft: { label: "Soft", radius: { xs: 4, sm: 7, md: 10, lg: 14, xl: 20, full: 999 }, tuck: true, corner: "round" },
  precise: { label: "Precise", radius: { xs: 2, sm: 3, md: 4, lg: 6, xl: 8, full: 999 }, tuck: false, corner: "round" },
  sigil: { label: "Sigil", radius: { xs: 1, sm: 2, md: 3, lg: 4, xl: 6, full: 999 }, tuck: true, corner: "ornament" },
  block: { label: "Block", radius: { xs: 0, sm: 0, md: 0, lg: 0, xl: 0, full: 0 }, tuck: false, corner: "pixel" },
  pillow: { label: "Pillow", radius: { xs: 8, sm: 12, md: 17, lg: 24, xl: 32, full: 999 }, tuck: false, corner: "round" },
  folio: { label: "Folio", radius: { xs: 1, sm: 2, md: 3, lg: 3, xl: 4, full: 999 }, tuck: false, corner: "round" },
};

export type Elevation = "plane" | "raised" | "float";

export interface MaterialTokens {
  label: string;
  /** Border treatment per elevation: 0 relies on tone and shadow alone. */
  border: Record<Elevation, number>;
  borderRole: "line" | "lineStrong";
  /** Inner second rule, inset from the edge (inlay). */
  inlay: boolean;
  shadow: Record<Elevation, "none" | "low" | "mid" | "high" | "hard" | "aura">;
  /** Depth a pressed surface travels, in points. Extruded blocks really do sink. */
  pressDepth: number;
}

export const MATERIALS: Record<MaterialId, MaterialTokens> = {
  aloft: { label: "Aloft", border: { plane: 0, raised: 0, float: 1 }, borderRole: "line", inlay: false, shadow: { plane: "none", raised: "low", float: "high" }, pressDepth: 0 },
  hairline: { label: "Hairline", border: { plane: 1, raised: 1, float: 1 }, borderRole: "line", inlay: false, shadow: { plane: "none", raised: "none", float: "mid" }, pressDepth: 0 },
  inlay: { label: "Inlay", border: { plane: 1, raised: 1, float: 1 }, borderRole: "lineStrong", inlay: true, shadow: { plane: "none", raised: "aura", float: "aura" }, pressDepth: 0 },
  extruded: { label: "Extruded", border: { plane: 2, raised: 2, float: 2 }, borderRole: "lineStrong", inlay: false, shadow: { plane: "none", raised: "hard", float: "hard" }, pressDepth: 3 },
  plush: { label: "Plush", border: { plane: 0, raised: 0, float: 0 }, borderRole: "line", inlay: false, shadow: { plane: "low", raised: "mid", float: "high" }, pressDepth: 0 },
  paper: { label: "Paper", border: { plane: 0, raised: 1, float: 1 }, borderRole: "line", inlay: false, shadow: { plane: "none", raised: "none", float: "low" }, pressDepth: 0 },
};

export interface MarkerTokens {
  label: string;
  width: number;
  height: number;
  radius: number;
  rotate: number;
  /** "under" sits beneath a label; "beside" sits at its leading edge. */
  stretch: boolean;
  glow: boolean;
  flight: "arc" | "snap" | "drift" | "step" | "hop" | "slide";
}

export const MARKERS: Record<MarkerId, MarkerTokens> = {
  mote: { label: "Mote", width: 6, height: 6, radius: 1, rotate: 0, stretch: false, glow: false, flight: "arc" },
  bar: { label: "Bar", width: 16, height: 2, radius: 0, rotate: 0, stretch: true, glow: false, flight: "snap" },
  rune: { label: "Rune", width: 7, height: 7, radius: 0, rotate: 45, stretch: false, glow: true, flight: "drift" },
  voxel: { label: "Voxel", width: 8, height: 8, radius: 0, rotate: 0, stretch: false, glow: false, flight: "step" },
  bead: { label: "Bead", width: 7, height: 7, radius: 4, rotate: 0, stretch: false, glow: false, flight: "hop" },
  rule: { label: "Rule", width: 18, height: 1.5, radius: 0, rotate: 0, stretch: true, glow: false, flight: "slide" },
};

export interface DensityTokens {
  label: string;
  /** Visual control height. Touch targets never fall below 44 pt; shorter controls extend their hit area instead. */
  control: { touch: number; pointer: number };
  /** Multiplies the spacing scale. */
  space: number;
  row: { touch: number; pointer: number };
}

export const DENSITIES: Record<DensityId, DensityTokens> = {
  compact: { label: "Compact", control: { touch: 40, pointer: 30 }, space: 0.78, row: { touch: 44, pointer: 32 } },
  comfortable: { label: "Comfortable", control: { touch: 44, pointer: 36 }, space: 1, row: { touch: 52, pointer: 40 } },
  spacious: { label: "Spacious", control: { touch: 50, pointer: 42 }, space: 1.2, row: { touch: 60, pointer: 48 } },
};

export interface SpringTokens { damping: number; stiffness: number; mass: number }

export interface MotionCharacter {
  label: string;
  /** Controls: fast, no visible overshoot. */
  settle: SpringTokens;
  /** Surfaces arriving: carries a little weight. */
  lift: SpringTokens;
  /** Panels and layout: long and smooth. */
  glide: SpringTokens;
  /** Frames per second when quantized (Voxel), otherwise 0. */
  steps: number;
  /** Fraction a surface scales from while arriving. */
  enterScale: number;
  /** Points a surface travels while arriving. */
  enterTravel: number;
  /** Press scale at full intensity. */
  pressScale: number;
}

export const MOTION_CHARACTERS: Record<MotionId, MotionCharacter> = {
  glide: { label: "Glide", settle: { damping: 30, stiffness: 520, mass: 1 }, lift: { damping: 26, stiffness: 300, mass: 1 }, glide: { damping: 32, stiffness: 210, mass: 1 }, steps: 0, enterScale: 0.975, enterTravel: 8, pressScale: 0.975 },
  crisp: { label: "Crisp", settle: { damping: 42, stiffness: 900, mass: 1 }, lift: { damping: 40, stiffness: 680, mass: 1 }, glide: { damping: 40, stiffness: 480, mass: 1 }, steps: 0, enterScale: 0.992, enterTravel: 3, pressScale: 0.99 },
  mystic: { label: "Mystic", settle: { damping: 28, stiffness: 340, mass: 1 }, lift: { damping: 24, stiffness: 150, mass: 1 }, glide: { damping: 30, stiffness: 130, mass: 1 }, steps: 0, enterScale: 0.96, enterTravel: 14, pressScale: 0.98 },
  stepped: { label: "Stepped", settle: { damping: 40, stiffness: 800, mass: 1 }, lift: { damping: 36, stiffness: 560, mass: 1 }, glide: { damping: 36, stiffness: 420, mass: 1 }, steps: 12, enterScale: 1, enterTravel: 8, pressScale: 1 },
  bounce: { label: "Bounce", settle: { damping: 15, stiffness: 340, mass: 1 }, lift: { damping: 15, stiffness: 210, mass: 1 }, glide: { damping: 20, stiffness: 180, mass: 1 }, steps: 0, enterScale: 0.92, enterTravel: 10, pressScale: 0.95 },
  turn: { label: "Page turn", settle: { damping: 34, stiffness: 460, mass: 1 }, lift: { damping: 34, stiffness: 240, mass: 1 }, glide: { damping: 36, stiffness: 190, mass: 1 }, steps: 0, enterScale: 1, enterTravel: 5, pressScale: 0.992 },
};

export const INTENSITIES: Record<IntensityId, { label: string; amount: number }> = {
  still: { label: "Still", amount: 0 },
  subtle: { label: "Subtle", amount: 0.55 },
  standard: { label: "Standard", amount: 1 },
  expressive: { label: "Expressive", amount: 1.4 },
};

export interface TypeRamp {
  label: string;
  hero: number; display: number; title: number; heading: number; subheading: number; body: number; small: number; label_: number; caption: number; readoutXL: number; readout: number; value: number;
  bodyLine: number;
  voiceCase: "none" | "uppercase";
  voiceTracking: number;
  labelCase: "none" | "uppercase";
  labelTracking: number;
  /** The voice role in italics for quotations, when the family has them. */
  quoteItalic: boolean;
  /** Captions are often full sentences, so they never take labelCase; a book sets them in italics instead. */
  captionItalic: boolean;
}

export const RAMPS: Record<RampId, TypeRamp> = {
  editorial: { label: "Editorial", hero: 60, display: 42, title: 29, heading: 19, subheading: 16, body: 16, small: 14, label_: 14, caption: 12, readoutXL: 76, readout: 28, value: 14, bodyLine: 1.5, voiceCase: "none", voiceTracking: 0, labelCase: "none", labelTracking: 0, quoteItalic: true, captionItalic: false },
  tight: { label: "Tight", hero: 42, display: 30, title: 22, heading: 16, subheading: 14, body: 14, small: 13, label_: 13, caption: 11, readoutXL: 60, readout: 22, value: 13, bodyLine: 1.45, voiceCase: "none", voiceTracking: -0.01, labelCase: "none", labelTracking: 0, quoteItalic: false, captionItalic: false },
  ceremonial: { label: "Ceremonial", hero: 58, display: 42, title: 30, heading: 20, subheading: 16, body: 16, small: 14, label_: 14, caption: 12, readoutXL: 76, readout: 28, value: 14, bodyLine: 1.5, voiceCase: "none", voiceTracking: 0.03, labelCase: "none", labelTracking: 0.01, quoteItalic: false, captionItalic: false },
  arcade: { label: "Arcade", hero: 54, display: 40, title: 28, heading: 18, subheading: 15, body: 15, small: 14, label_: 13, caption: 11, readoutXL: 68, readout: 26, value: 13, bodyLine: 1.45, voiceCase: "none", voiceTracking: 0, labelCase: "uppercase", labelTracking: 0.05, quoteItalic: false, captionItalic: false },
  friendly: { label: "Friendly", hero: 56, display: 40, title: 29, heading: 20, subheading: 17, body: 17, small: 15, label_: 15, caption: 13, readoutXL: 72, readout: 28, value: 15, bodyLine: 1.5, voiceCase: "none", voiceTracking: 0, labelCase: "none", labelTracking: 0, quoteItalic: false, captionItalic: false },
  book: { label: "Book", hero: 56, display: 40, title: 28, heading: 20, subheading: 17, body: 17, small: 15, label_: 13, caption: 13, readoutXL: 68, readout: 26, value: 14, bodyLine: 1.62, voiceCase: "none", voiceTracking: 0, labelCase: "uppercase", labelTracking: 0.09, quoteItalic: true, captionItalic: true },
};

export const ICON_STYLES: Record<IconStyleId, { label: string; stroke: number; cap: "square" | "butt" | "round"; join: "miter" | "round" }> = {
  square: { label: "Square", stroke: 1.5, cap: "square", join: "miter" },
  butt: { label: "Exact", stroke: 1.5, cap: "butt", join: "miter" },
  fine: { label: "Fine", stroke: 1.15, cap: "butt", join: "miter" },
  chunky: { label: "Chunky", stroke: 2.1, cap: "square", join: "miter" },
  round: { label: "Round", stroke: 1.8, cap: "round", join: "round" },
  pen: { label: "Pen", stroke: 1.25, cap: "round", join: "round" },
};

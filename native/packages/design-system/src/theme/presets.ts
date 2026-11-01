// The six built-in personalities, plus every swatch the web Appearance Settings offers, so nothing a user could pick
// there is lost. Signature is the default and the purest expression of the design language.
import type { ThemeAxes } from "./axes";

export type PresetId = "signature" | "studio" | "arcane" | "voxel" | "cozy" | "student";

export interface ThemePreset {
  id: PresetId;
  name: string;
  tagline: string;
  axes: ThemeAxes;
}

export const THEME_PRESETS: Record<PresetId, ThemePreset> = {
  signature: {
    id: "signature", name: "Sylf Signature", tagline: "Quiet, held in air. One point of light.",
    axes: { accentHex: "#6e5be6", groundDay: "#f3f2f8", groundNight: "#100e17", presence: "balanced", fontVoice: "newsreader", fontInterface: "instrument-sans", fontInstrument: "spline-mono", ramp: "editorial", shape: "soft", material: "aloft", marker: "mote", density: "comfortable", motion: "glide", intensity: "standard", icons: "square" },
  },
  studio: {
    id: "studio", name: "Studio", tagline: "Exact, dense, nothing decorative.",
    axes: { accentHex: "#2563eb", groundDay: "#f5f6f7", groundNight: "#14161a", presence: "quiet", fontVoice: "plex-sans", fontInterface: "plex-sans", fontInstrument: "plex-mono", ramp: "tight", shape: "precise", material: "hairline", marker: "bar", density: "compact", motion: "crisp", intensity: "subtle", icons: "butt" },
  },
  arcane: {
    id: "arcane", name: "Arcane", tagline: "Inlaid gold and old light.",
    axes: { accentHex: "#d4a843", groundDay: "#ece7f2", groundNight: "#0f0b22", presence: "vivid", fontVoice: "cinzel", fontInterface: "alegreya-sans", fontInstrument: "alegreya-sans", ramp: "ceremonial", shape: "sigil", material: "inlay", marker: "rune", density: "comfortable", motion: "mystic", intensity: "standard", icons: "fine" },
  },
  voxel: {
    id: "voxel", name: "Voxel", tagline: "Everything is a block you can press.",
    axes: { accentHex: "#7ccf1f", groundDay: "#e4eaf1", groundNight: "#12141d", presence: "vivid", fontVoice: "pixelify", fontInterface: "space-grotesk", fontInstrument: "jersey", ramp: "arcade", shape: "block", material: "extruded", marker: "voxel", density: "comfortable", motion: "stepped", intensity: "standard", icons: "chunky" },
  },
  cozy: {
    id: "cozy", name: "Cozy", tagline: "Warm, soft, in no hurry.",
    axes: { accentHex: "#d8704a", groundDay: "#faf2e7", groundNight: "#1f1714", presence: "balanced", fontVoice: "fraunces", fontInterface: "nunito", fontInstrument: "nunito", ramp: "friendly", shape: "pillow", material: "plush", marker: "bead", density: "spacious", motion: "bounce", intensity: "standard", icons: "round" },
  },
  student: {
    id: "student", name: "Student", tagline: "Set like a well-kept book.",
    axes: { accentHex: "#9b2c3a", groundDay: "#f7f3ea", groundNight: "#181a1f", presence: "quiet", fontVoice: "literata", fontInterface: "literata", fontInstrument: "plex-mono", ramp: "book", shape: "folio", material: "paper", marker: "rule", density: "comfortable", motion: "turn", intensity: "subtle", icons: "pen" },
  },
};

export const PRESET_ORDER: PresetId[] = ["signature", "studio", "arcane", "voxel", "cozy", "student"];

/** Web accent presets, kept verbatim: they are user-facing choices, not web styling. */
export const ACCENT_SWATCHES = [
  { name: "System Purple", hex: "#7c3aed" }, { name: "Electric Cyan", hex: "#06b6d4" }, { name: "Emerald", hex: "#10b981" }, { name: "Rose", hex: "#ec4899" },
  { name: "Amber Gold", hex: "#f59e0b" }, { name: "Crimson", hex: "#ef4444" }, { name: "Neon Lime", hex: "#84cc16" }, { name: "Royal Indigo", hex: "#6366f1" },
];
export const NIGHT_GROUND_SWATCHES = [
  { name: "Pure Black", hex: "#000000" }, { name: "Night Slate", hex: "#0f172a" }, { name: "Abyssal Navy", hex: "#0a0f1d" }, { name: "Midnight", hex: "#121218" }, { name: "Deep Void", hex: "#090d16" },
];
export const DAY_GROUND_SWATCHES = [
  { name: "Clean Light", hex: "#f8fafc" }, { name: "Pure White", hex: "#ffffff" }, { name: "Soft Fog", hex: "#f1f5f9" }, { name: "Cool Zinc", hex: "#e2e8f0" },
];

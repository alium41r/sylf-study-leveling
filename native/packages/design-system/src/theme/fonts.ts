// The typeface catalog. Files are named by PostScript name so one family string works on Android (file name),
// iOS (PostScript name) and web (registered family). Every family is SIL OFL; licenses sit beside the files.
export type FontRole = "voice" | "interface" | "instrument";
export type FontId = "newsreader" | "instrument-sans" | "spline-mono" | "plex-sans" | "plex-mono" | "cinzel" | "alegreya-sans" | "pixelify" | "space-grotesk" | "jersey" | "fraunces" | "nunito" | "literata";

export interface FontFaces { regular: string; medium: string; strong: string; light?: string; italic?: string }

export interface FontFamily {
  id: FontId;
  label: string;
  character: string;
  faces: FontFaces;
  /** Roles this family may fill. See the role rules below. */
  roles: FontRole[];
  /** Digits are equal width by design, or through the font's tnum feature. Required for the instrument role. */
  tabular: "native" | "feature" | false;
  /** Optical corrections so swapping a family keeps the same apparent size and color on the page. */
  metrics: { size: number; tracking: number; line: number };
}

// Role rules, enforced by the catalog and by normalizeAxes():
// - instrument: digits must not change width, so a running timer never jitters. Measured from the font tables.
// - interface:  must stay legible at 12 pt, so display-only pixel and inscriptional faces are excluded.
export const FONT_FAMILIES: Record<FontId, FontFamily> = {
  "newsreader": { id: "newsreader", label: "Newsreader", character: "Literary, unhurried", faces: { regular: "Newsreader-Regular", medium: "Newsreader-Regular", strong: "Newsreader-Regular", italic: "Newsreader-Italic" }, roles: ["voice", "instrument"], tabular: "native", metrics: { size: 1, tracking: -0.012, line: 1 } },
  "instrument-sans": { id: "instrument-sans", label: "Instrument Sans", character: "Crisp, editorial", faces: { regular: "InstrumentSans-Regular", medium: "InstrumentSans-Medium", strong: "InstrumentSans-SemiBold" }, roles: ["voice", "interface", "instrument"], tabular: "feature", metrics: { size: 1, tracking: 0, line: 1 } },
  "spline-mono": { id: "spline-mono", label: "Spline Sans Mono", character: "Calm instrument", faces: { regular: "SplineSansMono-Regular", medium: "SplineSansMono-Medium", strong: "SplineSansMono-Medium", light: "SplineSansMono-Light" }, roles: ["instrument"], tabular: "native", metrics: { size: 0.96, tracking: -0.01, line: 1 } },
  "plex-sans": { id: "plex-sans", label: "IBM Plex Sans", character: "Engineered, exact", faces: { regular: "IBMPlexSans-Regular", medium: "IBMPlexSans-SemiBold", strong: "IBMPlexSans-SemiBold" }, roles: ["voice", "interface", "instrument"], tabular: "native", metrics: { size: 0.98, tracking: -0.004, line: 1 } },
  "plex-mono": { id: "plex-mono", label: "IBM Plex Mono", character: "Typewritten, technical", faces: { regular: "IBMPlexMono-Regular", medium: "IBMPlexMono-Regular", strong: "IBMPlexMono-Regular", light: "IBMPlexMono-Light" }, roles: ["instrument"], tabular: "native", metrics: { size: 0.96, tracking: -0.01, line: 1 } },
  "cinzel": { id: "cinzel", label: "Cinzel", character: "Carved, ceremonial", faces: { regular: "Cinzel-Regular", medium: "Cinzel-Regular", strong: "Cinzel-SemiBold" }, roles: ["voice"], tabular: false, metrics: { size: 0.86, tracking: 0.02, line: 1.08 } },
  "alegreya-sans": { id: "alegreya-sans", label: "Alegreya Sans", character: "Calligraphic, storied", faces: { regular: "AlegreyaSans-Regular", medium: "AlegreyaSans-Medium", strong: "AlegreyaSans-Medium" }, roles: ["interface", "instrument"], tabular: "feature", metrics: { size: 1.06, tracking: 0.004, line: 1 } },
  "pixelify": { id: "pixelify", label: "Pixelify Sans", character: "Built from blocks", faces: { regular: "PixelifySans-Regular", medium: "PixelifySans-Regular", strong: "PixelifySans-SemiBold" }, roles: ["voice"], tabular: false, metrics: { size: 0.96, tracking: 0, line: 1.04 } },
  "space-grotesk": { id: "space-grotesk", label: "Space Grotesk", character: "Quirky, technical", faces: { regular: "SpaceGrotesk-Regular", medium: "SpaceGrotesk-Medium", strong: "SpaceGrotesk-SemiBold" }, roles: ["voice", "interface", "instrument"], tabular: "feature", metrics: { size: 0.97, tracking: -0.004, line: 1 } },
  "jersey": { id: "jersey", label: "Jersey 10", character: "Scoreboard", faces: { regular: "Jersey10-Regular", medium: "Jersey10-Regular", strong: "Jersey10-Regular" }, roles: ["instrument"], tabular: "feature", metrics: { size: 1.32, tracking: 0.02, line: 0.9 } },
  "fraunces": { id: "fraunces", label: "Fraunces", character: "Soft, friendly serif", faces: { regular: "Fraunces-Regular", medium: "Fraunces-Regular", strong: "Fraunces-SemiBold" }, roles: ["voice"], tabular: false, metrics: { size: 0.97, tracking: -0.01, line: 1 } },
  "nunito": { id: "nunito", label: "Nunito", character: "Rounded, gentle", faces: { regular: "Nunito-Regular", medium: "Nunito-SemiBold", strong: "Nunito-Bold" }, roles: ["voice", "interface", "instrument"], tabular: "native", metrics: { size: 1.02, tracking: 0, line: 1 } },
  "literata": { id: "literata", label: "Literata", character: "Made for long reading", faces: { regular: "Literata-Regular", medium: "Literata-SemiBold", strong: "Literata-SemiBold", italic: "Literata-Italic" }, roles: ["voice", "interface", "instrument"], tabular: "feature", metrics: { size: 0.95, tracking: -0.003, line: 1.04 } },
};

export const fontsForRole = (role: FontRole) => Object.values(FONT_FAMILIES).filter((family) => family.roles.includes(role));

/** Every PostScript name the catalog can ask for: the app's config plugin embeds these, and the web loader fetches them. */
export const ALL_FONT_FILES = [...new Set(Object.values(FONT_FAMILIES).flatMap((family) => Object.values(family.faces) as string[]))];

/**
 * The fontVariant a family needs for equal-width digits. Always an array, never undefined: React Native's Android
 * renderer turns a removed style prop into null, and processFontVariant(null) throws ("Cannot read property 'split'
 * of null") when a theme switch goes from a family that sets the feature to one that does not.
 */
export const tabularVariant = (family: FontFamily): ["tabular-nums"] | [] => (family.tabular === "feature" ? ["tabular-nums"] : []);

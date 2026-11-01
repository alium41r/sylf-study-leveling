// resolvePalette turns any appearance preference into a complete, contrast-safe palette.
// Every readable role is SOLVED against the surfaces it sits on rather than picked from a table, so the same rules
// hold for the default atmospheres and for a custom neon accent on a mid-gray ground. See documentation/native/design/.
import { appearance } from "@sylf/shared";
import { hexToOklch, mixColors, oklchToHex, withAlpha, type Oklch } from "./oklch";

export type Polarity = "light" | "dark";
export type Presence = "quiet" | "balanced" | "vivid";

export interface PaletteInput {
  /** The ground for this polarity slot. A custom ground decides the actual polarity, as it does on the web. */
  groundHex: string;
  accentHex: string;
  presence?: Presence;
  moreContrast?: boolean;
}

export interface ToneColors { ink: string; wash: string; mark: string }

export interface PaletteColors {
  ground: string;
  sunken: string;
  plane: string;
  raised: string;
  float: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  inkGhost: string;
  line: string;
  lineStrong: string;
  accent: { fill: string; on: string; ink: string; mote: string; wash: string; line: string };
  /** The one emphasised action. Quiet presence spends ink instead of accent on it. */
  emphasis: { fill: string; on: string };
  inverse: { fill: string; on: string };
  hover: string;
  press: string;
  selected: string;
  focus: string;
  scrim: string;
  positive: ToneColors;
  caution: ToneColors;
  critical: ToneColors;
}

export interface PaletteShadows { low: string; mid: string; high: string }

export interface PaletteReport {
  /** The user's exact accent could not be used as a fill on this ground and was shifted just enough to stay visible. */
  accentAdjusted: boolean;
  /** Surfaces were flattened because a mid-tone ground left no contrast room for elevation steps. */
  surfacesCompressed: boolean;
  /** WCAG ratios of the primary pairings, for display in the Appearance Studio. */
  ratios: { ink: number; inkSoft: number; accentInk: number; mote: number; onFill: number };
}

export interface Palette {
  polarity: Polarity;
  color: PaletteColors;
  shadow: PaletteShadows;
  report: PaletteReport;
}

const WHITE = "#ffffff";
const BLACK = "#000000";

export const contrast = (a: string, b: string) => appearance.getContrastRatio(a, b);
const worst = (color: string, surfaces: string[]) => surfaces.reduce((min, surface) => Math.min(min, contrast(color, surface)), Infinity);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The polarity whose ink reads best on a ground. Mirrors the web rule's intent with the true best-contrast ink. */
export function groundPolarity(groundHex: string): Polarity {
  return contrast(groundHex, WHITE) >= contrast(groundHex, BLACK) ? "dark" : "light";
}

/**
 * Finds the color of this hue closest to the surfaces that still reaches `target` on every one of them.
 * Stopping at the target, rather than going to pure white or black, is what keeps Aloft's ink soft.
 */
function solve(hue: number, chroma: number, surfaces: string[], target: number, polarity: Polarity): string {
  const toward = polarity === "dark" ? 1 : 0;
  const lightnesses = surfaces.map((s) => hexToOklch(s).l);
  const start = polarity === "dark" ? Math.max(...lightnesses) : Math.min(...lightnesses);
  const at = (l: number) => oklchToHex({ l, c: chroma, h: hue });
  if (worst(at(toward), surfaces) < target) return polarity === "dark" ? WHITE : BLACK;
  let near = start;
  let far = toward;
  for (let i = 0; i < 12; i++) {
    const mid = (near + far) / 2;
    if (worst(at(mid), surfaces) >= target) far = mid; else near = mid;
  }
  return at(far);
}

/** Tonal steps above the ground. Each candidate scale is tried until the ink still clears AA on every surface. */
function buildSurfaces(ground: Oklch, groundHex: string, polarity: Polarity, tint: Oklch | null) {
  const hue = tint ? tint.h : ground.h;
  const chroma = Math.max(ground.c * 0.85, tint ? Math.min(tint.c * 0.07, 0.02) : 0);
  // A zero step is the ground itself: re-deriving it through a reduced chroma would change its luminance.
  const step = (delta: number) => (delta === 0 ? groundHex : oklchToHex({ l: ground.l + delta, c: chroma * (ground.l > 0.9 ? 0.7 : 1), h: hue }));
  const ceiling = 1 - ground.l;
  for (const scale of [1, 0.7, 0.45, 0.2, 0]) {
    const surfaces = polarity === "dark"
      ? { sunken: step(-0.018 * scale), plane: step(0.032 * scale), raised: step(0.062 * scale), float: step(0.092 * scale) }
      : { sunken: step(-0.022 * scale), plane: step(Math.min(0.018, ceiling) * scale), raised: step(Math.min(0.03, ceiling) * scale), float: step(Math.min(0.036, ceiling) * scale) };
    const all = [groundHex, ...Object.values(surfaces)];
    if (worst(polarity === "dark" ? WHITE : BLACK, all) >= 4.5 || scale === 0) return { ...surfaces, compressed: scale < 1 };
  }
  throw new Error("unreachable");
}

function tone(hue: number, chroma: number, surfaces: string[], plane: string, polarity: Polarity, inkTarget: number): ToneColors {
  const base = hexToOklch(plane);
  const mark = solve(hue, chroma * 1.15, surfaces, 3, polarity);
  const wash = oklchToHex({ ...base, c: Math.max(base.c, chroma * 0.26), h: hue });
  const ink = solve(hue, chroma, [...surfaces, wash], inkTarget, polarity);
  // As with the accent wash, a tint that costs the text its contrast is dropped.
  if (worst(ink, [...surfaces, wash]) >= 4.5) return { ink, wash, mark };
  return { ink: solve(hue, chroma, surfaces, inkTarget, polarity), wash: plane, mark };
}

export function resolvePalette({ groundHex, accentHex, presence = "balanced", moreContrast = false }: PaletteInput): Palette {
  const ground = groundHex.toLowerCase();
  const polarity = groundPolarity(ground);
  const groundOk = hexToOklch(ground);
  const accentOk = hexToOklch(accentHex);
  const surfaces = buildSurfaces(groundOk, ground, polarity, presence === "vivid" ? accentOk : null);
  const { sunken, plane, raised, float, compressed } = surfaces;
  const all = [ground, sunken, plane, raised, float];
  const inkHue = presence === "vivid" ? accentOk.h : groundOk.h;
  const inkChroma = Math.min(0.018, Math.max(groundOk.c * 0.6, 0.006));

  const targets = moreContrast ? { ink: 15, soft: 7, faint: 4.5, line: 3 } : { ink: 13, soft: 5.6, faint: 3.6, line: 1.32 };
  const ink = solve(inkHue, inkChroma, all, targets.ink, polarity);
  const inkSoft = solve(inkHue, inkChroma, all, targets.soft, polarity);
  const inkFaint = solve(inkHue, inkChroma, all, targets.faint, polarity);
  const inkGhost = mixColors(plane, inkFaint, 0.55);
  const line = solve(inkHue, inkChroma, [ground, plane, raised], targets.line, polarity);
  const lineStrong = solve(inkHue, inkChroma, all, moreContrast ? 4.5 : 3, polarity);

  // The fill keeps the user's exact color whenever it is visible against the ground; otherwise it moves only in lightness.
  const fillVisible = worst(accentHex, [ground, plane]) >= 3;
  const fill = fillVisible ? accentHex : solve(accentOk.h, accentOk.c, [ground, plane, raised], 3, polarity);
  const on = solveOn(fill, accentOk);
  const washMix = { quiet: 0.09, balanced: 0.15, vivid: 0.24 }[presence];
  // On mid-tone grounds a full-strength wash can leave accent text no room, so the wash yields to the text.
  const inkTarget = moreContrast ? 7 : 4.5;
  let wash = plane;
  let accentInk = solve(accentOk.h, accentOk.c, all, inkTarget, polarity);
  for (const strength of [1, 0.66, 0.33]) {
    const candidate = mixColors(plane, fill, washMix * strength);
    const candidateInk = solve(accentOk.h, accentOk.c, [...all, candidate], inkTarget, polarity);
    if (worst(candidateInk, [...all, candidate]) >= Math.min(inkTarget, 4.5)) { wash = candidate; accentInk = candidateInk; break; }
  }
  const mote = solve(accentOk.h, Math.max(accentOk.c, 0.04), all, 3.2, polarity);
  const accentLine = mixColors(plane, fill, 0.5);

  const inverse = { fill: ink, on: ground };
  const overlay = polarity === "dark" ? WHITE : "#16121f";
  const [hoverAlpha, pressAlpha, selectedAlpha] = polarity === "dark" ? [0.065, 0.11, 0.09] : [0.045, 0.085, 0.065];
  const shadowColor = polarity === "dark" ? "0, 0, 0" : "28, 22, 48";
  const a = polarity === "dark" ? [0.34, 0.42, 0.52] : [0.05, 0.08, 0.12];

  return {
    polarity,
    color: {
      ground, sunken, plane, raised, float,
      ink, inkSoft, inkFaint, inkGhost, line, lineStrong,
      accent: { fill, on, ink: accentInk, mote, wash, line: accentLine },
      emphasis: presence === "quiet" ? inverse : { fill, on },
      inverse,
      hover: withAlpha(overlay, hoverAlpha),
      press: withAlpha(overlay, pressAlpha),
      selected: withAlpha(overlay, selectedAlpha),
      focus: solve(accentOk.h, clamp(accentOk.c, 0.08, 0.3), all, 3.4, polarity),
      scrim: withAlpha(polarity === "dark" ? BLACK : "#1a1626", polarity === "dark" ? 0.52 : 0.26),
      positive: tone(160, 0.12, all, plane, polarity, moreContrast ? 7 : 4.5),
      caution: tone(78, 0.12, all, plane, polarity, moreContrast ? 7 : 4.5),
      critical: tone(24, 0.16, all, plane, polarity, moreContrast ? 7 : 4.5),
    },
    shadow: {
      low: `0px 1px 2px rgba(${shadowColor}, ${a[0]})`,
      mid: `0px 6px 18px rgba(${shadowColor}, ${a[1]})`,
      high: `0px 18px 48px rgba(${shadowColor}, ${a[2]})`,
    },
    report: {
      accentAdjusted: !fillVisible,
      surfacesCompressed: compressed,
      ratios: { ink: worst(ink, all), inkSoft: worst(inkSoft, all), accentInk: worst(accentInk, all), mote: worst(mote, all), onFill: contrast(on, fill) },
    },
  };
}

/** Label color for a filled control: tinted toward the accent, never below AA. */
function solveOn(fill: string, accent: Oklch): string {
  const useLight = contrast(fill, WHITE) >= contrast(fill, BLACK);
  const candidate = oklchToHex({ l: useLight ? 0.985 : 0.16, c: 0.012, h: accent.h });
  if (contrast(candidate, fill) >= 4.5) return candidate;
  return useLight ? WHITE : BLACK;
}

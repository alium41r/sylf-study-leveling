// Composes axes, mode and accessibility into the semantic tokens every component reads. Components only ever see this
// result, never a theme id: nothing in the system may branch on "if Voxel". New personalities are data.
import { Platform, type TextStyle } from "react-native";
import { resolvePalette, type Palette, type Polarity } from "../color/palette";
import { DENSITIES, ICON_STYLES, INTENSITIES, MARKERS, MATERIALS, MOTION_CHARACTERS, RAMPS, SHAPES, type DensityTokens, type Elevation, type MarkerTokens, type MaterialTokens, type MotionCharacter, type ShapeTokens, type ThemeAxes } from "./axes";
import { FONT_FAMILIES, tabularVariant, type FontFamily } from "./fonts";
import { activeGround } from "./preference";

export type TextVariant = "hero" | "display" | "title" | "quote" | "heading" | "subheading" | "body" | "small" | "label" | "caption" | "readoutXL" | "readout" | "value" | "micro";

const SPACE = { hair: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, air: 48, sky: 72 };
export type SpaceTokens = typeof SPACE;

export interface ResolvedMotion extends MotionCharacter {
  /** 0 means crossfades only. System reduced motion and the Still intensity both land here. */
  amount: number;
  reduced: boolean;
  fade: { quick: number; base: number };
}

export interface DesignTheme {
  axes: ThemeAxes;
  mode: Polarity;
  palette: Palette;
  color: Palette["color"];
  space: SpaceTokens;
  shape: ShapeTokens;
  material: MaterialTokens;
  marker: MarkerTokens;
  density: DensityTokens;
  motion: ResolvedMotion;
  icon: (typeof ICON_STYLES)[keyof typeof ICON_STYLES];
  type: Record<TextVariant, TextStyle & { maxScale: number }>;
  fonts: { voice: FontFamily; interface: FontFamily; instrument: FontFamily };
  surface(level: Elevation, radius?: keyof ShapeTokens["radius"]): SurfaceStyle;
}

export interface SurfaceStyle { backgroundColor: string; borderWidth: number; borderColor: string; borderRadius: number; boxShadow?: string; borderCurve?: "continuous" }

export interface ResolveContext { mode: Polarity; moreContrast?: boolean; reducedMotion?: boolean; textScale?: number }

function buildType(axes: ThemeAxes, textScale: number) {
  const ramp = RAMPS[axes.ramp];
  const voice = FONT_FAMILIES[axes.fontVoice];
  const ui = FONT_FAMILIES[axes.fontInterface];
  const mono = FONT_FAMILIES[axes.fontInstrument];
  const tabular: TextStyle["fontVariant"] = tabularVariant(mono);
  const make = (family: FontFamily, face: string, size: number, lineRatio: number, tracking: number, maxScale: number, extra?: TextStyle) => {
    const fontSize = Math.round(size * family.metrics.size * textScale * 2) / 2;
    return {
      fontFamily: face,
      fontSize,
      lineHeight: Math.round(fontSize * lineRatio * family.metrics.line),
      letterSpacing: +((tracking + family.metrics.tracking) * fontSize).toFixed(2),
      maxScale,
      ...extra,
    };
  };
  const voiceCase: TextStyle = ramp.voiceCase === "none" ? {} : { textTransform: ramp.voiceCase };
  const labelCase: TextStyle = ramp.labelCase === "none" ? {} : { textTransform: ramp.labelCase };
  const v = voice.faces;
  const u = ui.faces;
  const m = mono.faces;
  const quoteFace = ramp.quoteItalic && v.italic ? v.italic : v.regular;
  return {
    hero: make(voice, v.regular, ramp.hero, 1.08, ramp.voiceTracking - 0.015, 1.2, voiceCase),
    display: make(voice, v.regular, ramp.display, 1.12, ramp.voiceTracking - 0.012, 1.25, voiceCase),
    title: make(voice, v.regular, ramp.title, 1.2, ramp.voiceTracking - 0.008, 1.3, voiceCase),
    quote: make(voice, quoteFace, ramp.heading + 1, 1.4, ramp.voiceTracking, 1.5, voiceCase),
    heading: make(ui, u.strong, ramp.heading, 1.32, -0.006, 1.5),
    subheading: make(ui, u.strong, ramp.subheading, 1.36, -0.002, 1.6),
    body: make(ui, u.regular, ramp.body, ramp.bodyLine, 0, 2),
    small: make(ui, u.regular, ramp.small, 1.44, 0, 2),
    label: make(ui, u.medium, ramp.label_, 1.3, ramp.labelTracking, 1.6, labelCase),
    caption: make(ui, ramp.captionItalic && u.italic ? u.italic : u.medium, ramp.caption, 1.34, 0.012, 1.6),
    readoutXL: make(mono, m.light ?? m.regular, ramp.readoutXL, 1.04, -0.03, 1.15, { fontVariant: tabular }),
    readout: make(mono, m.regular, ramp.readout, 1.16, -0.02, 1.3, { fontVariant: tabular }),
    value: make(mono, m.regular, ramp.value, 1.3, 0, 1.6, { fontVariant: tabular }),
    micro: make(mono, m.regular, ramp.caption - 1, 1.3, 0.03, 1.5, { fontVariant: tabular }),
  } satisfies DesignTheme["type"];
}

function shadowFor(kind: MaterialTokens["shadow"][Elevation], palette: Palette) {
  if (kind === "none") return undefined;
  if (kind === "hard") return `0px 4px 0px ${palette.color.lineStrong}`;
  if (kind === "aura") return `0px 0px 22px ${palette.polarity === "dark" ? palette.color.accent.wash : "rgba(40, 24, 80, 0.14)"}`;
  return palette.shadow[kind];
}

export function resolveDesign(axes: ThemeAxes, { mode, moreContrast = false, reducedMotion = false, textScale = 1 }: ResolveContext): DesignTheme {
  const palette = resolvePalette({ groundHex: activeGround(axes, mode), accentHex: axes.accentHex, presence: axes.presence, moreContrast });
  const shape = SHAPES[axes.shape];
  const material = MATERIALS[axes.material];
  const density = DENSITIES[axes.density];
  const character = MOTION_CHARACTERS[axes.motion];
  const reduced = reducedMotion || axes.intensity === "still";
  const amount = reduced ? 0 : INTENSITIES[axes.intensity].amount;
  const space = Object.fromEntries(Object.entries(SPACE).map(([k, v]) => [k, Math.round(v * density.space)])) as SpaceTokens;
  const shadows = { plane: shadowFor(material.shadow.plane, palette), raised: shadowFor(material.shadow.raised, palette), float: shadowFor(material.shadow.float, palette) };
  const borderColor = palette.color[material.borderRole];

  return {
    axes,
    mode,
    palette,
    color: palette.color,
    space,
    shape,
    material,
    marker: MARKERS[axes.marker],
    density,
    motion: { ...character, amount, reduced, fade: { quick: 110, base: 180 } },
    icon: ICON_STYLES[axes.icons],
    type: buildType(axes, textScale),
    fonts: { voice: FONT_FAMILIES[axes.fontVoice], interface: FONT_FAMILIES[axes.fontInterface], instrument: FONT_FAMILIES[axes.fontInstrument] },
    surface(level, radius = "lg") {
      const elevated = level !== "plane" && palette.report.surfacesCompressed;
      const border = moreContrast ? Math.max(1, material.border[level]) : Math.max(material.border[level], elevated ? 1 : 0);
      return {
        backgroundColor: palette.color[level],
        borderWidth: border,
        borderColor,
        borderRadius: shape.radius[radius],
        ...(shadows[level] ? { boxShadow: shadows[level] } : null),
        ...(Platform.OS === "ios" && shape.radius[radius] > 0 ? { borderCurve: "continuous" as const } : null),
      };
    },
  };
}

const MAX_CACHED = 12;
const cache = new Map<string, DesignTheme>();

/** Switching themes must feel instant, so recent resolutions are kept. The result is pure and safe to share. */
export function resolveDesignCached(axes: ThemeAxes, context: ResolveContext): DesignTheme {
  const key = JSON.stringify([axes, context.mode, !!context.moreContrast, !!context.reducedMotion, context.textScale ?? 1]);
  const hit = cache.get(key);
  if (hit) return hit;
  const theme = resolveDesign(axes, context);
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, theme);
  return theme;
}

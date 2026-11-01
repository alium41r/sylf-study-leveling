// Perceptual color math for Aloft. OKLCH keeps lightness steps even across hues, which HSL/HSV cannot do, so a
// custom accent or ground produces the same visual hierarchy whatever color the user picks.
// Contrast itself stays with the shared WCAG implementation (lib/color-utils.ts) through contrastRatio().
export interface Oklch { l: number; c: number; h: number }
type Rgb = [number, number, number];

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hexToLinear(hex: string): Rgb {
  const value = parseInt(hex.slice(1, 7), 16);
  return [toLinear(((value >> 16) & 255) / 255), toLinear(((value >> 8) & 255) / 255), toLinear((value & 255) / 255)];
}

function linearToHex([r, g, b]: Rgb): string {
  const channel = (v: number) => Math.round(clamp01(toSrgb(clamp01(v))) * 255);
  return `#${((1 << 24) | (channel(r) << 16) | (channel(g) << 8) | channel(b)).toString(16).slice(1)}`;
}

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export function hexToOklch(hex: string): Oklch {
  const [l, a, b] = linearToOklab(hexToLinear(hex));
  const c = Math.hypot(a, b);
  return { l, c, h: c < 1e-4 ? 0 : (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

function inGamut([r, g, b]: Rgb) {
  const margin = 0.0005;
  return r >= -margin && r <= 1 + margin && g >= -margin && g <= 1 + margin && b >= -margin && b <= 1 + margin;
}

/** Converts to sRGB, lowering chroma (never lightness or hue) until the color exists on real displays. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const lightness = clamp01(l);
  const radians = h * Math.PI / 180;
  const at = (chroma: number): Rgb => oklabToLinear([lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)]);
  let rgb = at(c);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (inGamut(at(mid))) low = mid; else high = mid;
    }
    rgb = at(low);
  }
  return linearToHex(rgb);
}

/** Mixes in OKLab so tints stay clean: `amount` 0 returns `from`, 1 returns `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const a = linearToOklab(hexToLinear(from));
  const b = linearToOklab(hexToLinear(to));
  return linearToHex(oklabToLinear([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]));
}

export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

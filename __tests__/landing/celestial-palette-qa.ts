import { readFileSync } from "node:fs";
import postcss from "postcss";

// Offline color/asset QA only. Sharp does not resolve CSS variables or
// color-mix, so resolve the source's sRGB aliases before rasterizing its SVG.
export type Palette = Record<string, string>;
export function declarations(file: string, selector: string): Palette {
  const result: Palette = {};
  postcss.parse(readFileSync(file, "utf8")).walkRules((rule) => {
    if (rule.selector === selector)
      rule.walkDecls((decl) => {
        result[decl.prop] = decl.value;
      });
  });
  return result;
}

const decor = "app/components/landing/journey/CelestialDecor.module.css";
const journey = "app/components/landing/journey/Journey.module.css";
export const daylight = {
  ...declarations(journey, '.landing[data-surface="light"]'),
  ...declarations(decor, ':global([data-surface="light"]) .world'),
};

export function rgba(value: string): number[] {
  if (value === "transparent") return [0, 0, 0, 0];
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    return [0, 2, 4]
      .map((i) => parseInt(hex.slice(i, i + 2), 16))
      .concat(hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1);
  }
  const match = value.match(/^rgba\(([^)]+)\)$/);
  if (!match) throw new Error(`Unsupported QA color: ${value}`);
  return match[1].split(",").map(Number);
}

export function resolve(value: string, palette: Palette): string {
  const substituted = value.replace(
    /var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,
    (_, name: string, fallback: string) => {
      const source = palette[name] ?? fallback;
      if (source === undefined) throw new Error(`Missing QA token: ${name}`);
      return resolve(source.trim(), palette);
    }
  );
  const mix = substituted.match(/^color-mix\(in srgb, (.+) ([\d.]+)%, (.+)\)$/);
  if (!mix) return substituted;
  const a = rgba(mix[1]),
    b = rgba(mix[3]),
    weight = Number(mix[2]) / 100,
    alpha = a[3] * weight + b[3] * (1 - weight);
  const rgb = [0, 1, 2].map((i) =>
    Math.round(
      (a[i] * a[3] * weight + b[i] * b[3] * (1 - weight)) / (alpha || 1)
    )
  );
  return alpha === 1
    ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`
    : `rgba(${rgb.join(",")},${alpha})`;
}

export function resolveSvg(source: string, palette: Palette): string {
  return source.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (value) =>
    resolve(value, palette)
  );
}

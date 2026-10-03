import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { afterAll, expect, it } from "vitest";
import {
  CelestialLeaf,
  CelestialStar,
  CelestialLantern,
  CelestialBooks,
} from "@/app/components/landing/journey/CelestialMotifs";
import { getContrastRatio } from "@/lib/color-utils";
import { daylight, resolve, resolveSvg } from "./celestial-palette-qa";

const motifs = {
  CelestialLeaf,
  CelestialStar,
  CelestialLantern,
  CelestialBooks,
};
const dark = { color: "#adb8ff" };
function svg(source: string, palette: Record<string, string>) {
  return resolveSvg(source, palette)
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replaceAll("currentColor", resolve(palette.color, palette));
}

it.each(Object.entries(motifs))(
  "keeps %s identical to the approved dark-mode artwork",
  async (name, Motif) => {
    const baseline = readFileSync(
      `__tests__/landing/fixtures/celestial-dark/${name}.svg`,
      "utf8"
    );
    const current = renderToStaticMarkup(<Motif />);
    const [before, after] = await Promise.all(
      [baseline, current].map((source) =>
        sharp(Buffer.from(svg(source, dark)))
          .ensureAlpha()
          .raw()
          .toBuffer()
      )
    );
    expect(after.equals(before)).toBe(true);
  }
);

it.each(["#395d9f", "#1f776c", "#9a426f"])(
  "keeps light-mode glass cores and paper distinguishable with accent %s",
  (accent) => {
    const palette = { ...daylight, "--accent": accent };
    const core = resolve("var(--decor-lantern-core)", palette);
    const glass = resolve("var(--decor-glass-mid)", palette);
    const pages = resolve("var(--decor-pages-end)", palette);
    const cover = resolve("var(--decor-book-cover)", palette);
    // These are decorative material checks, not WCAG claims about content.
    expect(getContrastRatio(core, glass)).toBeGreaterThan(3);
    expect(getContrastRatio(cover, pages)).toBeGreaterThan(2);
  }
);

afterAll(async () => {
  if (!process.env.SYLF_CELESTIAL_ARTIFACTS) return;
  const dir =
    "documentation/landing-companion/reports/light-mode-decorations/evidence";
  mkdirSync(dir, { recursive: true });
  const light = { ...daylight, color: "var(--decor-star)" };
  for (const [name, Motif] of Object.entries(motifs)) {
    const current = renderToStaticMarkup(<Motif />);
    const legacy = readFileSync(
      `__tests__/landing/fixtures/celestial-dark/${name}.svg`,
      "utf8"
    );
    for (const [state, source, palette] of [
      ["dark", current, dark],
      ["light-before", legacy, { color: "#686cbe" }],
      ["light", current, light],
    ] as const) {
      const rendered = svg(source, palette);
      writeFileSync(`${dir}/${name}-${state}.svg`, rendered);
      await sharp(Buffer.from(rendered))
        .resize({ width: name === "CelestialStar" ? 16 : 180 })
        .png()
        .toFile(`${dir}/${name}-${state}.png`);
    }
  }
  writeFileSync(
    `${dir}/resolved-light-palette.json`,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(light)
          .filter(([key]) => key.startsWith("--decor-"))
          .map(([key, value]) => [key, resolve(value, light)])
      ),
      null,
      2
    )
  );

  const asset = (
    name: string,
    state: string,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    let source = readFileSync(`${dir}/${name}-${state}.svg`, "utf8");
    // Each server render starts its own useId scope; the comparison sheet
    // combines them, so prefix references to prevent cross-row gradient reuse.
    const ids = [...source.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    for (const id of ids)
      source = source.replaceAll(id, `${state}-${name}-${id}`);
    return source.replace(
      "<svg ",
      `<svg x="${x}" y="${y}" width="${width}" height="${height}" `
    );
  };
  const color = (name: string) => resolve(`var(--decor-${name})`, light);
  const row = (state: string, y: number) => {
    const current = state === "light",
      pale = state !== "dark";
    const background = pale ? daylight["--page"] : "#080d17";
    const ink = pale ? daylight["--ink"] : "#eef1f8";
    const line = current ? color("vine") : pale ? "#7070b1" : "#797cdf";
    const star = current ? color("star") : pale ? "#686cbe" : "#adb8ff";
    const label = current
      ? "Revised light mode"
      : pale
        ? "Previous light mode"
        : "Dark mode (preserved)";
    return `<g transform="translate(0 ${y})"><rect width="1000" height="250" fill="${background}"/><text x="32" y="34" fill="${ink}" font-size="16" font-family="sans-serif">${label}</text><g opacity="${state === "light-before" ? ".63" : "1"}">
      <path d="M30 60C280 30 175 220 392 217M920 50C815 94 994 150 845 240" fill="none" stroke="${line}" stroke-width=".65" opacity="${current ? ".4" : ".44"}"/>
      <g opacity="${current ? ".84" : ".92"}">${asset("CelestialLeaf", state, 105, 102, 72, 38)}${asset("CelestialLeaf", state, 237, 168, 54, 29)}</g>
      <g opacity="${current ? ".86" : ".88"}">${asset("CelestialBooks", state, 421, 99, 145, 110)}</g>
      <g opacity="${current ? ".96" : ".88"}"><path d="M728 50V95" stroke="${current ? color("hanger") : "#9893d755"}" stroke-width="1"/>${asset("CelestialLantern", state, 704, 93, 48, 104)}</g>
      <path d="M891 62V202" stroke="${star}" stroke-width="1" opacity=".4"/>${asset("CelestialStar", state, 887, 162, 8, 12)}<circle cx="825" cy="80" r="1" fill="${star}" opacity=".4"/>
    </g></g>`;
  };
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750">${row("dark", 0)}${row("light-before", 250)}${row("light", 500)}</svg>`;
  writeFileSync(`${dir}/material-comparison.svg`, sheet);
  await sharp(Buffer.from(sheet))
    .png()
    .toFile(`${dir}/material-comparison.png`);
});

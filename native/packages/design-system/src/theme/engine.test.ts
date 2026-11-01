import { describe, expect, it } from "vitest";
import { contrast, groundPolarity, resolvePalette } from "../color/palette";
import { hexToOklch, mixColors, oklchToHex } from "../color/oklch";
import { FONT_FAMILIES, tabularVariant } from "./fonts";
import { THEME_PRESETS, PRESET_ORDER, ACCENT_SWATCHES, NIGHT_GROUND_SWATCHES, DAY_GROUND_SWATCHES } from "./presets";
import { DEFAULT_PREFERENCE, activeGround, companionGround, fromWebAccount, normalizeAxes, normalizePreference, resolveAxes, toWebAccount } from "./preference";
import { createAppearanceStore, APPEARANCE_STORAGE_KEY } from "./store";

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const randomHex = (r: () => number) => `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, "0")}`;

function assertSafe(groundHex: string, accentHex: string, presence: "quiet" | "balanced" | "vivid", moreContrast: boolean) {
  const p = resolvePalette({ groundHex, accentHex, presence, moreContrast });
  const c = p.color;
  const surfaces = [c.ground, c.sunken, c.plane, c.raised, c.float];
  const min = (color: string, on = surfaces) => Math.min(...on.map((s) => contrast(color, s)));
  const label = `${groundHex} ${accentHex} ${presence} more=${moreContrast}`;
  expect(min(c.ink), `ink ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(min(c.inkSoft), `soft ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(min(c.inkFaint), `faint ${label}`).toBeGreaterThanOrEqual(3);
  expect(min(c.accent.ink), `accentInk ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.accent.ink, c.accent.wash), `accentInk on wash ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(min(c.accent.mote), `mote ${label}`).toBeGreaterThanOrEqual(3);
  expect(min(c.focus), `focus ${label}`).toBeGreaterThanOrEqual(3);
  expect(min(c.lineStrong), `lineStrong ${label}`).toBeGreaterThanOrEqual(3);
  expect(contrast(c.accent.on, c.accent.fill), `on fill ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.emphasis.on, c.emphasis.fill), `emphasis ${label}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(c.inverse.on, c.inverse.fill), `inverse ${label}`).toBeGreaterThanOrEqual(4.5);
  for (const tone of [c.positive, c.caution, c.critical]) {
    expect(min(tone.ink), `tone ${label}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tone.ink, tone.wash), `tone wash ${label}`).toBeGreaterThanOrEqual(4.5);
    expect(min(tone.mark), `mark ${label}`).toBeGreaterThanOrEqual(3);
  }
  return p;
}

describe("oklch", () => {
  it("round-trips sRGB within one channel step", () => {
    const r = seeded(4);
    for (let i = 0; i < 300; i++) {
      const hex = randomHex(r);
      const back = oklchToHex(hexToOklch(hex));
      for (const o of [1, 3, 5]) expect(Math.abs(parseInt(hex.slice(o, o + 2), 16) - parseInt(back.slice(o, o + 2), 16))).toBeLessThanOrEqual(1);
    }
  });
  it("keeps out-of-gamut colors valid by lowering chroma", () => { expect(oklchToHex({ l: 0.9, c: 0.4, h: 145 })).toMatch(/^#[0-9a-f]{6}$/); });
  it("mixes endpoints exactly", () => { expect(mixColors("#102030", "#ffffff", 0)).toBe("#102030"); expect(mixColors("#102030", "#ffffff", 1)).toBe("#ffffff"); });
});

describe("palette contrast guarantees", () => {
  it("holds for every preset in both modes, both contrast levels, and all presences", () => {
    for (const id of PRESET_ORDER) for (const ground of ["groundDay", "groundNight"] as const) for (const more of [false, true]) for (const presence of ["quiet", "balanced", "vivid"] as const) assertSafe(THEME_PRESETS[id].axes[ground], THEME_PRESETS[id].axes.accentHex, presence, more);
  });
  it("holds for every web swatch combination", () => {
    for (const a of ACCENT_SWATCHES) for (const g of [...NIGHT_GROUND_SWATCHES, ...DAY_GROUND_SWATCHES]) assertSafe(g.hex, a.hex, "balanced", false);
  });
  it("holds for 4000 random custom colors, including mid-tone grounds", () => {
    const r = seeded(7);
    const presences = ["quiet", "balanced", "vivid"] as const;
    for (let i = 0; i < 4000; i++) assertSafe(randomHex(r), randomHex(r), presences[i % 3], i % 2 === 0);
  });
  it("keeps the user's exact accent as the fill when it is visible", () => {
    const p = resolvePalette({ groundHex: "#100e17", accentHex: "#ec4899" });
    expect(p.color.accent.fill).toBe("#ec4899");
    expect(p.report.accentAdjusted).toBe(false);
  });
  it("adjusts and reports an accent that disappears into the ground", () => {
    const p = resolvePalette({ groundHex: "#ffffff", accentHex: "#fffdf0" });
    expect(p.report.accentAdjusted).toBe(true);
    expect(contrast(p.color.accent.fill, "#ffffff")).toBeGreaterThanOrEqual(3);
  });
  it("lets a custom ground decide polarity, independent of the mode", () => {
    expect(groundPolarity("#fbdfec")).toBe("light");
    expect(groundPolarity("#1a7775")).toBe("dark");
  });
  it("resolves a palette quickly enough for live previews", () => {
    const r = seeded(11);
    const start = performance.now();
    for (let i = 0; i < 200; i++) resolvePalette({ groundHex: randomHex(r), accentHex: randomHex(r) });
    expect((performance.now() - start) / 200).toBeLessThan(8);
  });
});

describe("presets are distinct personalities", () => {
  it("differ on every structural axis, not just color", () => {
    for (const axis of ["fontVoice", "ramp", "shape", "material", "marker", "motion", "icons"] as const) expect(new Set(PRESET_ORDER.map((id) => THEME_PRESETS[id].axes[axis])).size, axis).toBe(6);
  });
  it("use only role-legal fonts", () => {
    for (const id of PRESET_ORDER) {
      const a = THEME_PRESETS[id].axes;
      expect(FONT_FAMILIES[a.fontVoice].roles).toContain("voice");
      expect(FONT_FAMILIES[a.fontInterface].roles).toContain("interface");
      expect(FONT_FAMILIES[a.fontInstrument].roles).toContain("instrument");
    }
  });
  it("always gives text an array fontVariant (Android crashed on null when a theme switch removed the prop)", () => {
    for (const family of Object.values(FONT_FAMILIES)) expect(Array.isArray(tabularVariant(family)), family.id).toBe(true);
  });
  it("only allow tabular faces in the instrument role", () => {
    for (const family of Object.values(FONT_FAMILIES)) if (family.roles.includes("instrument")) expect(family.tabular, family.id).not.toBe(false);
  });
});

describe("preference normalization", () => {
  it("rejects invalid colors, unknown axes and role-illegal fonts", () => {
    const base = THEME_PRESETS.signature.axes;
    const axes = normalizeAxes({ accentHex: "nope", shape: "circle" as never, fontInterface: "jersey", fontInstrument: "cinzel" }, base);
    expect(axes).toEqual(base);
  });
  it("survives corrupt input", () => {
    expect(normalizePreference(null)).toEqual(DEFAULT_PREFERENCE);
    expect(normalizePreference({ themeId: "ghost", saved: "x", access: { textScale: 99 } }).access.textScale).toBe(1.4);
    expect(normalizePreference({ themeId: "ghost" }).themeId).toBe("signature");
  });
  it("never pins untouched axes when normalizing overrides", () => {
    expect(normalizePreference({ themeId: "voxel", overrides: { accentHex: "#ff0000" } }).overrides).toEqual({ accentHex: "#ff0000" });
  });
});

describe("web account bridge", () => {
  it("treats schema defaults as no choice", () => {
    expect(fromWebAccount({ activeTheme: "default", activeBackground: "none" }).overrides).toEqual({});
    expect(fromWebAccount({ activeTheme: "default", activeBackground: "simple" }).overrides).toEqual({});
  });
  it("imports legacy preset ids through the shared tables", () => {
    const { overrides } = fromWebAccount({ activeTheme: "sakura", activeBackground: "deep-ocean" });
    expect(overrides).toEqual({ accentHex: "#ec4899", groundDay: "#c8e4fb", groundNight: "#020710" });
  });
  it("imports a custom hex into the right slot and derives its partner", () => {
    const { overrides, mode } = fromWebAccount({ activeTheme: "#10B981", activeBackground: "#0f172a" });
    expect(mode).toBe("dark");
    expect(overrides.accentHex).toBe("#10b981");
    expect(overrides.groundNight).toBe("#0f172a");
    expect(groundPolarity(overrides.groundDay!)).toBe("light");
  });
  it("round-trips the two account fields losslessly", () => {
    const imported = fromWebAccount({ activeTheme: "#7c3aed", activeBackground: "#121218", appMode: "dark" });
    const out = toWebAccount({ ...DEFAULT_PREFERENCE, ...imported }, "light");
    expect(out).toEqual({ activeTheme: "#7c3aed", activeBackground: "#121218", appMode: "dark" });
  });
  it("derives opposite-polarity partners", () => {
    expect(groundPolarity(companionGround("#000000"))).toBe("light");
    expect(groundPolarity(companionGround("#ffffff"))).toBe("dark");
  });
  it("follows the system when mode is system", () => {
    expect(toWebAccount(DEFAULT_PREFERENCE, "light").activeBackground).toBe(THEME_PRESETS.signature.axes.groundDay);
    expect(toWebAccount(DEFAULT_PREFERENCE, "dark").activeBackground).toBe(THEME_PRESETS.signature.axes.groundNight);
  });
});

describe("appearance store", () => {
  const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };
  it("persists and restores across launches", () => {
    const s = memory();
    const a = createAppearanceStore(s);
    a.selectTheme("cozy");
    a.tweak({ accentHex: "#123456" });
    a.flush();
    const b = createAppearanceStore(s).getSnapshot().preference;
    expect(b.themeId).toBe("cozy");
    expect(resolveAxes(b).accentHex).toBe("#123456");
    expect(resolveAxes(b).material).toBe("plush");
  });
  it("starts safely from corrupt storage", () => {
    const s = memory();
    s.setItem(APPEARANCE_STORAGE_KEY, "{broken");
    expect(createAppearanceStore(s).getSnapshot().preference.themeId).toBe("signature");
  });
  it("undoes and redoes", () => {
    const a = createAppearanceStore();
    a.selectTheme("voxel");
    a.tweak({ shape: "pillow" });
    a.undo();
    expect(resolveAxes(a.getSnapshot().preference).shape).toBe("block");
    a.undo();
    expect(a.getSnapshot().preference.themeId).toBe("signature");
    a.redo();
    expect(a.getSnapshot().preference.themeId).toBe("voxel");
    expect(a.getSnapshot().canRedo).toBe(true);
  });
  it("keeps previews out of the applied preference until committed, as one undo step", () => {
    const a = createAppearanceStore();
    a.preview({ accentHex: "#111111" });
    a.preview({ accentHex: "#222222" });
    expect(resolveAxes(a.getSnapshot().preference).accentHex).toBe(THEME_PRESETS.signature.axes.accentHex);
    a.commitPreview();
    expect(resolveAxes(a.getSnapshot().preference).accentHex).toBe("#222222");
    a.undo();
    expect(resolveAxes(a.getSnapshot().preference).accentHex).toBe(THEME_PRESETS.signature.axes.accentHex);
  });
  it("records recents on commit, newest first, capped at six", () => {
    const a = createAppearanceStore();
    for (let i = 0; i < 8; i++) a.tweak({ accentHex: `#00000${i}` });
    expect(a.getSnapshot().preference.recents.accents).toEqual(["#000007", "#000006", "#000005", "#000004", "#000003", "#000002"]);
  });
  it("saves, updates, renames and deletes custom themes", () => {
    const a = createAppearanceStore();
    a.selectTheme("arcane");
    a.tweak({ density: "compact" });
    const saved = a.saveAs("  Exam night  ")!;
    expect(saved.name).toBe("Exam night");
    expect(a.getSnapshot().preference.themeId).toBe(saved.id);
    expect(a.getSnapshot().preference.overrides).toEqual({});
    expect(resolveAxes(a.getSnapshot().preference).density).toBe("compact");
    a.tweak({ density: "spacious" });
    a.updateSaved();
    expect(a.getSnapshot().preference.saved[0].axes.density).toBe("spacious");
    a.renameSaved(saved.id, "Finals");
    a.deleteSaved(saved.id);
    expect(a.getSnapshot().preference.themeId).toBe("arcane");
  });
  it("keeps accessibility choices when the theme changes, and saved themes through reset", () => {
    const a = createAppearanceStore();
    a.setAccess({ textScale: 1.2, contrast: "more" });
    a.selectTheme("student");
    expect(a.getSnapshot().preference.access.textScale).toBe(1.2);
    a.saveAs("Mine");
    a.resetAll();
    expect(a.getSnapshot().preference.saved).toHaveLength(1);
    expect(a.getSnapshot().preference.themeId).toBe("signature");
  });
  it("gives each mode its own ground so system mode works", () => {
    const axes = THEME_PRESETS.signature.axes;
    expect(activeGround(axes, "light")).not.toBe(activeGround(axes, "dark"));
  });
});

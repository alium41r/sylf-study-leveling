import { describe, expect, it } from "vitest";
import { createPixDisplay } from "@/lib/pixel-display/engine";
import {
  REFERENCE_ASSETS,
  createAssetLookup,
  paintComposition,
} from "@/lib/pixel-display/content/asset";
import { resolveEquippedCharacter } from "@/app/dashboard/pixel-modular-character";
import {
  DENSITY_PRESETS,
  buildCustomizerCategories,
  densityIdForResolution,
  drawsTheSameCompanion,
  pendingContentKeys,
  resolutionForDensity,
} from "@/app/locker/components/identity/pixel-customizer-options";

/**
 * ============================================================================
 * PHASE 7 — THE CHARACTER CUSTOMIZER
 * ============================================================================
 * What these tests protect:
 *
 *   1. the customizer offers only choices that genuinely differ;
 *   2. it never lets a scholar see or write an implementation concept;
 *   3. density is a bounded, validated preference that does not move the card;
 *   4. every configuration a scholar can reach — including a broken one —
 *      produces a character.
 *
 * The draft/save contract belongs to the Identity tab and is tested through the
 * component suite; this file tests the decisions the customizer makes.
 */

const LOOKUP = createAssetLookup(REFERENCE_ASSETS);

const build = (
  config: Parameters<typeof buildCustomizerCategories>[0] extends infer T
    ? Omit<Extract<T, object>, "isUnlocked"> & { unlocked?: boolean }
    : never,
) =>
  buildCustomizerCategories({
    outfit: config.outfit ?? undefined,
    pedestal: config.pedestal ?? undefined,
    aura: config.aura ?? undefined,
    relic: config.relic ?? undefined,
    isUnlocked: () => config.unlocked ?? true,
  });

// ─── What is offered ─────────────────────────────────────────────────────────

describe("the customizer offers only real choices", () => {
  it("does not offer a built-in character category", () => {
    expect(build({ outfit: 'sylf' }).map(category => category.id)).not.toContain('form');
  });

  it("hides a category whose catalogue offers no choice", () => {
    // Aura and Held hold only an "unequipped" entry, so neither is a choice and
    // neither has anything pending. Showing them would be furniture.
    const ids = build({ outfit: "form_tanjiro" }).map((c) => c.id);
    expect(ids).not.toContain("aura");
    expect(ids).not.toContain("relic");
  });

  it("never offers an option the companion cannot draw", () => {
    // Every offered key must resolve to a real asset, or the scholar would pick
    // something and see the wrong figure.
    for (const category of build({ outfit: "form_tanjiro" })) {
      for (const option of category.options) {
        const resolved = resolveEquippedCharacter(
          { [category.configKey]: option.key },
          { lookup: LOOKUP, state: "IDLE" },
        );
        // Either it is deliberately empty, or it resolved to something real.
        const degraded = resolved.degraded.some(
          (entry) => entry.key === option.key,
        );
        expect(degraded, `${category.id}:${option.key}`).toBe(false);
      }
    }
  });

  it("has no retired character choices even for legacy selections", () => {
    expect(build({ outfit: 'form_tanjiro' }).flatMap(category => category.options).some(option => option.label === 'Sylf')).toBe(false);
  });

  it("does not advertise retired artwork as pending content", () => {
    expect(pendingContentKeys()).toEqual([]);
  });

  it("labels every remaining option with its catalogue name", () => {
    for (const option of build({ outfit: 'none' }).flatMap(category => category.options)) expect(option.label.length).toBeGreaterThan(0);
  });
});

// ─── Nothing implementation-facing ───────────────────────────────────────────

describe("a scholar never sees an implementation concept", () => {
  const forbidden =
    /asset|plane|anchor|pivot|pixel:|matrix|framebuffer|renderer|state|sylf:|form_|pedestal_|relic_|aura_/i;

  it("keeps technical vocabulary out of every label", () => {
    for (const category of build({ outfit: "form_tanjiro" })) {
      expect(category.label, category.id).not.toMatch(forbidden);
      expect(category.hint, category.id).not.toMatch(forbidden);
      for (const option of category.options) {
        expect(option.label, option.key).not.toMatch(forbidden);
      }
    }
  });

  it("phrases an unlock as something a scholar has, not as a rank code", () => {
    const locked = build({ outfit: "form_tanjiro", unlocked: false })
      .flatMap((category) => category.options)
      .filter((option) => option.requirement);
    for (const option of locked) {
      expect(option.requirement).toMatch(/^Requires /);
      expect(option.requirement).not.toMatch(/RANK\s+[A-Z]/);
    }
  });

  it("names the categories in scholar language", () => {
    const labels = build({ outfit: "form_tanjiro" }).map((c) => c.label);
    expect(labels).not.toContain("Character");
    for (const label of labels) {
      expect(label).not.toMatch(/_/);
    }
  });
});

// ─── Locked and unlocked ─────────────────────────────────────────────────────

describe("locked content is shown as locked, not hidden", () => {
  it("does not reintroduce a retired character through unlock gating", () => {
    const categories = buildCustomizerCategories({ outfit: 'sylf', isUnlocked: () => false });
    expect(categories.some(category => category.id === 'form')).toBe(false);
  });

  it("never marks a legacy character as an equipped choice", () => {
    const options = build({ outfit: 'form_tanjiro' }).flatMap(category => category.options);
    expect(options.some(option => option.key === 'sylf')).toBe(false);
  });

  it("uses the existing rank and level rule rather than a new one", () => {
    // The customizer borrows `isRankSufficient`; a second rule would be a second
    // source of truth about what a scholar owns.
    const withGate = buildCustomizerCategories({
      outfit: "form_tanjiro",
      isUnlocked: (rank, level) => rank === undefined && level === undefined,
    });
    // Nothing that declares a requirement is available under that gate.
    for (const option of withGate.flatMap((category) => category.options)) {
      if (option.availability === "available") {
        expect(option.requirement).toBeUndefined();
      }
    }
  });
});

// ─── Density ─────────────────────────────────────────────────────────────────

describe("pixel density is a bounded, validated preference", () => {
  it("offers exactly four presets", () => {
    expect(DENSITY_PRESETS).toHaveLength(4);
  });

  it("maps every preset to a resolution the engine has been tested at", () => {
    // 32/40/48/64 are the resolutions every phase since Phase 0 measured and
    // tested with. A preset pointing anywhere else would be untested content.
    const tested = [32, 40, 48, 64];
    for (const preset of DENSITY_PRESETS) {
      expect(tested, preset.id).toContain(preset.resolution);
    }
  });

  it("uses ids that are not numbers, so a scholar never sees a matrix size", () => {
    for (const preset of DENSITY_PRESETS) {
      expect(preset.id).not.toMatch(/^\d+$/);
      expect(preset.label).not.toMatch(/\d/);
    }
  });

  it("resolves a stored id, and falls back for a missing or unknown one", () => {
    expect(resolutionForDensity("chunky")).toBe(32);
    expect(resolutionForDensity("finest")).toBe(64);
    // Every configuration written before this phase has no density at all.
    expect(resolutionForDensity(undefined)).toBe(48);
    expect(resolutionForDensity(null)).toBe(48);
    expect(resolutionForDensity("from-a-future-build")).toBe(48);
  });

  it("converts an older resolution back to a preset id", () => {
    expect(densityIdForResolution(32)).toBe("chunky");
    expect(densityIdForResolution(64)).toBe("finest");
    // An untested value degrades to the default rather than inventing a preset.
    expect(densityIdForResolution(37)).toBe("detailed");
  });

  it("every preset keeps an unselected display empty", () => {
    for (const preset of DENSITY_PRESETS) {
      const display = createPixDisplay(preset.resolution, preset.resolution);
      const composition = resolveEquippedCharacter(
        {
          outfit: "form_tanjiro",
          pedestal: "pedestal_cyber",
          density: preset.id,
        },
        { lookup: LOOKUP, state: "IDLE" },
      ).composition;
      const result = paintComposition(display, composition);
      expect(result.totalCells, preset.id).toBe(0);
      expect(result.parts.flatMap((p) => p.problems), preset.id).toEqual([]);
    }
  });

  it("keeps attachment offsets identical across every preset", () => {
    // The requirement in one assertion: density changes pixel size and nothing
    // else, so a held item cannot move relative to its character.
    const offsets = DENSITY_PRESETS.map((preset) => {
      const display = createPixDisplay(preset.resolution, preset.resolution);
      const result = paintComposition(
        display,
        resolveEquippedCharacter(
          { outfit: "form_tanjiro", pedestal: "pedestal_cyber" },
          { lookup: LOOKUP, state: "IDLE" },
        ).composition,
      );
      return result.parts
        .filter((part) => part.slot !== "character")
        .map((part) => `${part.offsetX},${part.offsetY}`)
        .join("|");
    });
    expect(new Set(offsets).size).toBe(1);
  });
});

// ─── Draft, save and reset ───────────────────────────────────────────────────

describe("the draft/save model reports change honestly", () => {
  it("treats a configuration with no density as already saved", () => {
    // Every configuration written before this phase has no density, and the
    // companion draws at the default. Reading that default as a change would show
    // "Unsaved" to every scholar who has not touched the setting.
    const legacy = {
      outfit: "form_tanjiro",
      pedestal: "pedestal_cyber",
      aura: "none",
      relic: "relic_none",
    };
    expect(drawsTheSameCompanion(legacy, { ...legacy })).toBe(true);
    // The preview resolves a density; the saved object does not have one.
    expect(
      drawsTheSameCompanion({ ...legacy, density: "detailed" }, legacy),
    ).toBe(true);
  });

  it("ignores fields nothing draws", () => {
    // Legacy keys like `skin` and `hairStyle` are not part of the companion, so
    // changing one is not an unsaved companion change.
    const base = { outfit: "form_tanjiro", density: "detailed" };
    expect(
      drawsTheSameCompanion(base, { ...base, skin: "olive", hairStyle: "3" }),
    ).toBe(true);
  });

  it("distinguishes Original even when Detailed shares the same authored grid", () => {
    expect(drawsTheSameCompanion({ outfit: "user:mine", density: "original" }, { outfit: "user:mine", density: "detailed" })).toBe(false);
    expect(drawsTheSameCompanion({ outfit: "user:mine" }, { outfit: "user:mine", density: "original" })).toBe(true);
  });

  it("reports a real change", () => {
    expect(
      drawsTheSameCompanion(
        { outfit: "form_tanjiro", density: "detailed" },
        { outfit: "form_tanjiro", density: "chunky" },
      ),
    ).toBe(false);
  });

  it("is order-independent", () => {
    expect(
      drawsTheSameCompanion(
        { outfit: "form_tanjiro", aura: "none" },
        { aura: "none", outfit: "form_tanjiro" },
      ),
    ).toBe(true);
  });
});

// ─── Legacy and unknown content ──────────────────────────────────────────────

describe("an unknown or legacy configuration cannot break the editor", () => {
  const legacy: Array<[string, Record<string, unknown>]> = [
    ["a key from a future build", { outfit: "form_from_the_future" }],
    ["a key nothing defines", { aura: "aura_obsidian" }],
    ["the live configuration", {
      aura: "aura_obsidian",
      outfit: "form_deadpool",
      accessory: "circlet_heroic",
      skin: "olive",
      hairStyle: "3",
    }],
    ["every slot unknown", {
      outfit: "a",
      pedestal: "b",
      aura: "c",
      relic: "d",
    }],
  ];

  it("still builds categories", () => {
    for (const [label, config] of legacy) {
      const categories = buildCustomizerCategories({
        outfit: config.outfit as string,
        pedestal: config.pedestal as string,
        aura: config.aura as string,
        relic: config.relic as string,
        isUnlocked: () => true,
      });
      // Whatever it offers, it must not throw and must not offer junk.
      for (const category of categories) {
        for (const option of category.options) {
          expect(option.key, `${label} ${category.id}`).not.toBe("");
        }
      }
    }
  });

  it("does not substitute artwork for any legacy configuration", () => {
    for (const [label, config] of legacy) {
      const display = createPixDisplay(48, 48);
      const composition = resolveEquippedCharacter(
        config as never,
        { lookup: LOOKUP, state: "IDLE" },
      ).composition;
      const result = paintComposition(display, composition);
      expect(result.totalCells, label).toBe(0);
      expect(display.litCount(), label).toBe(0);
    }
  });

  it("does not offer a legacy key the companion cannot draw", () => {
    const options = buildCustomizerCategories({
      outfit: "form_deadpool",
      aura: "aura_obsidian",
      isUnlocked: () => true,
    }).flatMap((category) => category.options);
    const keys = options.map((option) => option.key);
    expect(keys).not.toContain("form_deadpool");
    expect(keys).not.toContain("aura_obsidian");
  });
});

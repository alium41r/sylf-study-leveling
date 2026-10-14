"use client";

/**
 * ============================================================================
 * PIXEL CUSTOMIZER — CATEGORIES AND OPTIONS
 * ============================================================================
 * What a scholar can choose in the Character Customizer, derived from the
 * catalogues that already own those choices.
 *
 * TWO RULES THIS FILE EXISTS TO KEEP
 *
 *   1. **It invents nothing.** Every option comes from an existing catalogue —
 *      `PIXEL_COMPANIONS`, `PEDESTAL_OPTIONS`, `AURA_PRESETS` — and carries that
 *      catalogue's own rarity and requirements. There is no second cosmetics
 *      model, no duplicated unlock rule, and no option created to fill space.
 *
 *   2. **It hides nothing that exists, and shows nothing that cannot render.**
 *      A category appears only when it offers a real choice. An option appears
 *      only when the Pixel Display can actually draw it — an option that silently
 *      rendered the wrong thing would be worse than an absent one, so content
 *      that has no Pixel Asset yet is reported rather than offered.
 *
 * A scholar never sees an asset id, a plane, an anchor or a coordinate. They see
 * a name, a rarity and whether they have earned it.
 * ============================================================================
 */

import {
  AURA_PRESETS,
  PIXEL_COMPANIONS,
  PEDESTAL_OPTIONS,
  RELIC_OPTIONS,
  type TraitOption,
} from "@/lib/character-traits";
import {
  REFERENCE_ASSETS,
  createAssetLookup,
} from "@/lib/pixel-display/content/asset";
import { resolveCosmeticKey } from "@/app/dashboard/pixel-cosmetic-registry";
import { normalizeDisplayBorder, normalizePixelGap } from '@/lib/pixel-display-style';

/** The catalogue lookup, resolved once. */
const CATALOGUE = createAssetLookup(REFERENCE_ASSETS);

/**
 * Pixel density presets.
 *
 * A small, bounded, **validated** set rather than a slider: 32/40/48/64 are the
 * resolutions the engine has been measured and tested at since Phase 0, and an
 * arbitrary value between them has never been looked at by anyone.
 *
 * The labels describe what a scholar will *see* — how chunky the pixels are —
 * because "48 × 48 logical matrix" is an implementation detail. The hint carries
 * the one consequence that is actually a trade-off.
 */
export interface DensityPreset {
  readonly id: DensityId;
  readonly label: string;
  readonly hint: string;
  readonly resolution: number;
}

export type DensityId = "original" | "chunky" | "balanced" | "detailed" | "finest";

export const DENSITY_PRESETS: readonly DensityPreset[] = [
  {
    id: "chunky",
    label: "Chunky",
    hint: "Biggest pixels, boldest shapes",
    resolution: 32,
  },
  {
    id: "balanced",
    label: "Balanced",
    hint: "Larger pixels, fewer details",
    resolution: 40,
  },
  {
    id: "detailed",
    label: "Detailed",
    hint: "Finer pixels, more definition",
    resolution: 48,
  },
  {
    id: "finest",
    label: "Finest",
    hint: "Smallest pixels, most detail",
    resolution: 64,
  },
];

export const DEFAULT_DENSITY_ID: DensityId = "detailed";

/** The resolution for a stored density id, falling back to the default. */
export function resolutionForDensity(id: string | null | undefined, authoredGrid?: number): number {
  if (authoredGrid && (id === "original" || !id)) return authoredGrid;
  const preset = DENSITY_PRESETS.find((entry) => entry.id === id);
  if (preset) return preset.resolution;
  return (
    DENSITY_PRESETS.find((entry) => entry.id === DEFAULT_DENSITY_ID)
      ?.resolution ?? 48
  );
}

/** The preset id for a stored resolution, for older configurations. */
export function densityIdForResolution(resolution: number): DensityId {
  const preset = DENSITY_PRESETS.find(
    (entry) => entry.resolution === resolution,
  );
  return preset?.id ?? DEFAULT_DENSITY_ID;
}

// ─── Options ─────────────────────────────────────────────────────────────────

/**
 * How an option relates to the scholar.
 *
 * Four states, because "locked" and "cannot be drawn" are genuinely different
 * problems and a scholar deserves to know which one they are looking at.
 */
export type OptionAvailability =
  /** The Pixel Display can draw it, and the scholar has earned it. */
  | "available"
  /** The Pixel Display can draw it, but rank or level has not been reached. */
  | "locked"
  /** It is what the scholar is wearing right now. */
  | "equipped";

export interface CustomizerOption {
  /** The **persisted** key. Written to `characterConfig` unchanged. */
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly rarity?: string;
  readonly tier?: number;
  /** What an unlock needs, phrased for a scholar rather than as a rank code. */
  readonly requirement?: string;
  readonly availability: OptionAvailability;
  /** Small colour swatch, when the catalogue offers one. */
  readonly swatch?: string;
}

export interface CustomizerCategory {
  readonly id: CategoryId;
  readonly label: string;
  readonly hint: string;
  readonly options: readonly CustomizerOption[];
  /** Which `CharacterConfig` field this category writes. */
  readonly configKey: "outfit" | "pedestal" | "aura" | "relic";
  /**
   * Catalogue entries in this category that the companion cannot draw yet.
   *
   * Kept per category so a surface can say *where* the gap is — "four more
   * looks are coming" — rather than only how many gaps exist overall.
   */
  readonly pendingCount: number;
}

export type CategoryId = "form" | "pedestal" | "aura" | "relic";

// ─── Building the options ────────────────────────────────────────────────────

/** Local, so the customizer never imports an asset-authoring concept publicly. */
function canRender(
  registrySlot: "form" | "pedestal" | "aura" | "relic",
  key: string,
): boolean {
  const resolved = resolveCosmeticKey(registrySlot, key);
  if (resolved.kind === "unequipped") return true;
  if (resolved.kind !== "asset") return false;
  return CATALOGUE(resolved.assetId) !== undefined;
}

function requirementLabel(
  requiredRank?: string,
  requiredLevel?: number,
): string | undefined {
  const parts: string[] = [];
  if (requiredRank) {
    // "RANK E" reads as a code; "Rank E" reads as a thing a scholar has.
    parts.push(requiredRank.replace(/^RANK\s+/i, "Rank "));
  }
  if (requiredLevel && requiredLevel > 1) parts.push(`Level ${requiredLevel}`);
  return parts.length > 0 ? `Requires ${parts.join(" · ")}` : undefined;
}

function toOption(
  trait: TraitOption,
  registrySlot: "form" | "pedestal" | "aura" | "relic",
  currentKey: string | undefined,
  unlocked: boolean,
): CustomizerOption | null {
  // An option the display cannot draw is not offered. Reporting it as available
  // and then painting something else is the one outcome worse than hiding it.
  if (!canRender(registrySlot, trait.value)) return null;

  /*
   * Equipped means "this is what the companion is showing", not "this is the
   * string in the configuration".
   *
   * The two differ when the stored key is one the companion cannot draw: the
   * figure falls back to the base, so the base is what is on screen and is what
   * should read as selected. Marking nothing would leave a scholar looking at a
   * figure with no card highlighted and no way to tell what they are wearing.
   */
  const equipped =
    currentKey === trait.value ||
    (resolveCosmeticKey(registrySlot, currentKey).kind === "asset" && JSON.stringify(resolveCosmeticKey(registrySlot, currentKey)) === JSON.stringify(resolveCosmeticKey(registrySlot, trait.value))) ||
    (!canRender(registrySlot, currentKey ?? "") &&
      renderedKeyFor(registrySlot, currentKey) === trait.value);
  return {
    key: trait.value,
    label: trait.label,
    description: trait.description,
    rarity: trait.rarity,
    tier: trait.tier,
    requirement: requirementLabel(trait.requiredRank, trait.requiredLevel),
    availability: equipped ? "equipped" : unlocked ? "available" : "locked",
    swatch: trait.previewColor,
  };
}

export interface BuildCategoriesInput {
  readonly outfit?: string | null;
  readonly pedestal?: string | null;
  readonly aura?: string | null;
  readonly relic?: string | null;
  /** Whether the scholar meets a catalogue entry's rank and level. */
  readonly isUnlocked: (
    requiredRank?: string,
    requiredLevel?: number,
  ) => boolean;
}

/**
 * Builds the categories to show, and only those with a real choice.
 *
 * A category with one option is not a choice, so it is omitted rather than
 * rendered as a section containing a single card. That is why the accessory slot
 * and the held-item slot do not appear today: the catalogues behind them contain
 * only "none".
 */
export function buildCustomizerCategories(
  input: BuildCategoriesInput,
): readonly CustomizerCategory[] {
  const categories: CustomizerCategory[] = [];

  const form = collect(
    // Only forms the companion can actually draw. The rest are counted, not
    // offered: six cards that all painted the same figure would be a choice that
    // did nothing, which is worse than an honest gap.
    renderableOnly(PIXEL_COMPANIONS, "form"),
    "form",
    input.outfit ?? undefined,
    input,
  );
  const formPending =
    PIXEL_COMPANIONS.length - renderableOnly(PIXEL_COMPANIONS, "form").length;
  if (form.options.length) {
    categories.push({
      id: "form",
      label: "Character",
      hint: "Who your companion is.",
      configKey: "outfit",
      options: form.options,
      pendingCount: formPending,
    });
  }

  const pedestal = collect(
    PEDESTAL_OPTIONS,
    "pedestal",
    input.pedestal ?? undefined,
    input,
  );
  if (shouldShow(pedestal)) {
    categories.push({
      id: "pedestal",
      label: "Ground",
      hint: "What your companion stands on.",
      configKey: "pedestal",
      options: pedestal.options,
      pendingCount: pedestal.pendingCount,
    });
  }

  const aura = collect(
    AURA_PRESETS.map(auraToTrait),
    "aura",
    input.aura ?? undefined,
    input,
  );
  if (shouldShow(aura)) {
    categories.push({
      id: "aura",
      label: "Aura",
      hint: "The glow your companion carries.",
      configKey: "aura",
      options: aura.options,
      pendingCount: aura.pendingCount,
    });
  }

  const relic = collect(
    RELIC_OPTIONS,
    "relic",
    input.relic ?? undefined,
    input,
  );
  if (shouldShow(relic)) {
    categories.push({
      id: "relic",
      label: "Held",
      hint: "What your companion carries.",
      configKey: "relic",
      options: relic.options,
      pendingCount: relic.pendingCount,
    });
  }

  return categories;
}

interface Collected {
  readonly options: readonly CustomizerOption[];
  readonly pendingCount: number;
}

function collect(
  traits: readonly TraitOption[],
  slot: "form" | "pedestal" | "aura" | "relic",
  currentKey: string | undefined,
  input: BuildCategoriesInput,
): Collected {
  const options: CustomizerOption[] = [];
  let pendingCount = 0;
  for (const trait of traits) {
    const option = toOption(
      trait,
      slot,
      currentKey,
      input.isUnlocked(trait.requiredRank, trait.requiredLevel),
    );
    if (option) options.push(option);
    else pendingCount += 1;
  }
  return { options, pendingCount };
}

/**
 * Whether a category is worth showing.
 *
 * A category earns its place by offering a **real** choice — more than one
 * option — or by having finished content with more on the way, which is a
 * meaningful thing to tell a scholar. A category with exactly one option and
 * nothing pending is not a choice, so showing it would be furniture.
 *
 * That rule is why Aura and Held are absent today: their catalogues hold only an
 * "unequipped" entry, so neither is a choice and neither has anything coming.
 */
function shouldShow(collected: Collected): boolean {
  return collected.options.length > 1 || collected.pendingCount > 0;
}

/**
 * `AURA_PRESETS` describes itself with `id` rather than `value`, so it is adapted
 * rather than duplicated. Nothing about it is re-declared.
 */
function auraToTrait(preset: {
  id: string;
  label: string;
  tier: number;
  rarity: TraitOption["rarity"];
  requiredRank: string;
  requiredLevel: number;
  color: string;
}): TraitOption {
  return {
    id: preset.id,
    label: preset.label,
    value: preset.id,
    previewColor: preset.color,
    tier: preset.tier as TraitOption["tier"],
    rarity: preset.rarity,
    requiredRank: preset.requiredRank,
    requiredLevel: preset.requiredLevel,
  };
}

/**
 * Which catalogue key a stored key actually renders as.
 *
 * `null` when the stored key is one the companion *can* draw, because then the
 * stored key is the honest answer and no substitution is happening.
 */
function renderedKeyFor(
  registrySlot: "form" | "pedestal" | "aura" | "relic",
  key: string | undefined,
): string | null {
  if (!key) return null;
  const resolved = resolveCosmeticKey(registrySlot, key);
  if (resolved.kind === "unequipped") return null;
  // The key resolved, so nothing is being substituted for it.
  if (resolved.kind === "asset") return null;
  // It did not resolve: the composition falls back to the base, which for every
  // category that has a base is the first catalogue entry.
  return null;
}

/**
 * The fields the companion actually draws from.
 *
 * Comparing whole configurations makes the changed/unchanged readout lie: the
 * preview adds a resolved `density`, the saved configuration carries legacy keys
 * like `skin` and `hairStyle` that nothing draws, and a key order difference is
 * not a change. Comparing only what is drawn is what makes "Unsaved" mean
 * "this would look different".
 */
export const DRAWN_CONFIG_FIELDS = [
  "outfit",
  "pedestal",
  "pedestalKey",
  "aura",
  "relic",
  "weapon",
  "accessory",
  "density",
  "displayBorder",
  "pixelGap",
] as const;

/**
 * A stable string for the drawn configuration, for equality comparison.
 *
 * `density` is resolved to its preset id first, on **both** sides. A scholar who
 * has never opened the customizer has no density stored, and the companion draws
 * at the default — so reading the default as a change would show "Unsaved" to
 * everyone who has not touched the setting, which is precisely wrong.
 */
export function drawnConfigSignature(
  config: object | null | undefined,
): string {
  // `CharacterConfig` is an interface rather than a record, so it is indexed
  // through a widened view of the same object.
  const source = (config ?? {}) as Record<string, unknown>;
  const userDrawing = typeof source.outfit === 'string' && source.outfit.startsWith('user:');
  const density = source.density === 'original' || (!source.density && userDrawing)
    ? 'original' : densityIdForResolution(resolutionForDensity(source.density as string | undefined));
  const normalized = { ...source, density, displayBorder: normalizeDisplayBorder(source.displayBorder), pixelGap: normalizePixelGap(source.pixelGap, userDrawing), pedestal: source.pedestal ?? source.pedestalKey };
  return DRAWN_CONFIG_FIELDS.filter(field => field !== 'pedestalKey').map(field => {
    const slot = field === 'outfit' ? 'form' : field === 'weapon' ? 'relic' : field === 'accessory' ? 'outfit' : field;
    const value = normalized[field as keyof typeof normalized];
    if (['form', 'pedestal', 'aura', 'relic', 'weapon', 'accessory'].includes(slot)) {
      const resolved = resolveCosmeticKey(slot as 'form' | 'pedestal' | 'aura' | 'relic' | 'outfit', typeof value === 'string' ? value : undefined);
      return `${field}=${resolved.kind === 'asset' ? resolved.assetId : resolved.kind === 'unequipped' ? '' : String(value ?? '')}`;
    }
    return `${field}=${String(value ?? '')}`;
  }).join('|');
}

/** Whether two configurations would draw the same companion. */
export function drawsTheSameCompanion(
  a: object | null | undefined,
  b: object | null | undefined,
): boolean {
  return drawnConfigSignature(a) === drawnConfigSignature(b);
}

/** Only the catalogue entries the companion can draw. */
function renderableOnly(
  traits: readonly TraitOption[],
  slot: "form" | "pedestal" | "aura" | "relic",
): readonly TraitOption[] {
  return traits.filter((trait) => canRender(slot, trait.value));
}

/**
 * Catalogue entries that exist as choices but that the Pixel Display cannot draw
 * yet, so the absence is legible rather than mysterious.
 *
 * Reported, never offered. This is the honest counterpart of hiding them: a
 * scholar sees why a form they own is not in the list rather than wondering
 * whether the interface is broken.
 */
export function pendingContentKeys(): readonly string[] {
  const pending: string[] = [];
  const groups: Array<[readonly TraitOption[], "form" | "pedestal" | "relic"]> = [
    [PIXEL_COMPANIONS, "form"],
    [PEDESTAL_OPTIONS, "pedestal"],
    [RELIC_OPTIONS, "relic"],
  ];
  for (const [traits, slot] of groups) {
    for (const trait of traits) {
      if (!canRender(slot, trait.value)) pending.push(`${slot}:${trait.value}`);
    }
  }
  for (const preset of AURA_PRESETS) {
    if (!canRender("aura", preset.id)) pending.push(`aura:${preset.id}`);
  }
  return pending;
}

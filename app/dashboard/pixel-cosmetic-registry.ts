"use client";

/** Translates persisted cosmetic keys to optional accessories and owned artwork.
 * Retired character keys deliberately resolve to an empty display. */

import {
  EMBER_AURA_ASSET,
  MEADOW_PEDESTAL_ASSET,
  PRACTICE_WAND_ASSET,
  STUDY_SCARF_ASSET,
  type PixelAsset,
} from "@/lib/pixel-display/content/asset";

/** The equipment slots an equipped character is assembled from. */
export type CosmeticSlot = "form" | "pedestal" | "aura" | "relic" | "outfit";

/**
 * The registry.
 *
 * Keys on the left are the **persisted identifiers**, unchanged. Values on the
 * right are asset ids. `null` means "this key is deliberately nothing" — an
 * explicit unequip — which is different from a key being unknown.
 */
export const PIXEL_COSMETIC_REGISTRY: Record<
  CosmeticSlot,
  Readonly<Record<string, string | null>>
> = {
  // Read compatibility only: retired character keys resolve to an empty display.
  // The choice catalog exposes exactly the artwork that exists.
  form: {
    sylf: null,
    form_tanjiro: null,
    form_gojo: null,
    form_uzui: null,
    form_itadori: null,
    form_shinobu: null,
    form_mitsuri: null,
    form_megumi: null,
    form_nezuko: null,
    form_nobara: null,
    form_rengoku: null,
    form_megumin: null,
    form_choso: null,
    form_eren: null,
    form_deadpool: null,
    form_venom: null,
    form_spiderman: null,
    default_hunter: null,
    test_hunter_base: null,
  },

  /** `PEDESTAL_OPTIONS` — `pedestal_cyber` is the persisted default. */
  pedestal: {
    pedestal_cyber: MEADOW_PEDESTAL_ASSET.id,
    pedestal_meadow: MEADOW_PEDESTAL_ASSET.id,
  },

  /** `AURA_PRESETS` — `none` is the persisted default and means no aura. */
  aura: {
    none: null,
    aura_none: null,
    aura_ember: EMBER_AURA_ASSET.id,
  },

  /** `RELIC_OPTIONS` — `relic_none` is the persisted default. */
  relic: {
    relic_none: null,
    none: null,
    // The trait catalogue lists only the unequipped relic today. These keys name
    // the migrated asset so the held path is driven by a real persisted
    // identifier rather than by a special case in the composer.
    relic_practice_wand: PRACTICE_WAND_ASSET.id,
    weapon_practice_wand: PRACTICE_WAND_ASSET.id,
  },

  /**
   * The legacy `accessory` field. The catalogue's `ACCESSORY_STYLES` offers only
   * "No Headgear", so this is the one slot whose *content* is deferred while its
   * mechanism is present.
   */
  outfit: {
    none: null,
    outfit_none: null,
    accessory_study_scarf: STUDY_SCARF_ASSET.id,
    outfit_study_scarf: STUDY_SCARF_ASSET.id,
  },
};

/**
 * Keys that mean "nothing equipped".
 *
 * Spelled out rather than inferred from `null` values alone, because a scholar's
 * configuration may hold any of them and the composer needs to tell "deliberately
 * empty" from "unknown" — the first is normal, the second is what the fallback
 * notice is for.
 */
const UNEQUIPPED_KEYS = new Set([
  "none",
  "None",
  "NONE",
  "",
  "relic_none",
  "aura_none",
  "outfit_none",
  "pedestal_none",
]);

export type CosmeticResolution =
  | { readonly kind: "asset"; readonly assetId: string }
  | { readonly kind: "unequipped" }
  | { readonly kind: "unknown" };

/**
 * Resolves one persisted key.
 *
 * Three outcomes, and the difference between the last two matters:
 *
 *   - `asset`      — the key is mapped;
 *   - `unequipped` — the key deliberately means nothing (`none`, `relic_none`);
 *   - `unknown`    — the registry has never heard of it, so the slot falls back
 *                    to a safe default and the caller can say so.
 *
 * An unknown key is reported; no substitute character is supplied.
 */
export function resolveCosmeticKey(
  slot: CosmeticSlot,
  key: string | undefined | null,
): CosmeticResolution {
  const table = PIXEL_COSMETIC_REGISTRY[slot];

  if (key === undefined || key === null || UNEQUIPPED_KEYS.has(key)) {
    return { kind: "unequipped" };
  }

  /*
   * A scholar's own creation.
   *
   * The `user:` namespace is claimed here rather than left to the static table,
   * because a creation is per-scholar and cannot be listed in advance. The
   * registry does not verify that it exists — that is the catalogue's job, and
   * the resolver already handles an id the catalogue does not have by falling
   * back and reporting. A creation that was deleted therefore degrades to the
   * empty display rather than substituting another character.
   */
  // A configuration is untrusted input: `characterConfig` is a JSON column that
  // has held numbers, objects and arrays. Anything that is not a string cannot
  // name an asset, so it degrades rather than throwing on a dashboard render.
  if (typeof key !== "string") {
    return { kind: "unknown" };
  }

  if (key.startsWith("user:")) {
    return { kind: "asset", assetId: key };
  }

  const mapped = table[key];
  if (mapped === undefined) {
    // Not in the table at all: unknown. The resolver decides the fallback —
    // an empty display for a form, nothing at all for an accessory — because that
    // choice depends on the slot's *role*, not on the registry's contents.
    return { kind: "unknown" };
  }
  if (mapped === null) return { kind: "unequipped" };
  return { kind: "asset", assetId: mapped };
}

/** Every key the registry knows for a slot. Used by tests and tooling. */
export function knownCosmeticKeys(slot: CosmeticSlot): readonly string[] {
  return Object.keys(PIXEL_COSMETIC_REGISTRY[slot]);
}

/** Every asset the registry can produce. Used to assert they all validate. */
export function registryAssetIds(): readonly string[] {
  const ids = new Set<string>();
  for (const slot of Object.keys(
    PIXEL_COSMETIC_REGISTRY,
  ) as CosmeticSlot[]) {
    for (const assetId of Object.values(PIXEL_COSMETIC_REGISTRY[slot])) {
      if (assetId) ids.add(assetId);
    }
  }
  return [...ids];
}

/** A catalogue lookup, so the composer can turn an id into an asset. */
export type AssetLookup = (id: string) => PixelAsset | undefined;

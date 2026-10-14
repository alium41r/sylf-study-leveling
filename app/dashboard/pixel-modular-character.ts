"use client";

/** Resolves owned artwork and compatible accessories. Missing or retired
 * characters produce an empty composition; no artwork is ever substituted. */

import {
  EMBER_AURA_ASSET,
  MEADOW_PEDESTAL_ASSET,
  EMPTY_CHARACTER_ASSET,
  type AssetLookup,
  type CompositionPart,
  type ModularComposition,
  type PixelAsset,
  resolveAttachment,
  type SylfState,
} from "@/lib/pixel-display/content/asset";
import { resolveCosmeticKey } from "./pixel-cosmetic-registry";

/**
 * The persisted configuration, as far as this phase reads it.
 *
 * Structural and stringly-typed on purpose. Requiring the app's full
 * `CharacterConfig` here would couple the display path to a type that carries
 * fifteen legacy cosmetic fields, and would make this module fail to compile the
 * next time an unrelated trait is added.
 */
export interface EquippedConfig {
  /** `CharacterConfig.outfit` — the full-body form key. */
  readonly outfit?: string | null;
  /** `CharacterConfig.pedestal`, or the legacy `pedestalKey`. */
  readonly pedestal?: string | null;
  readonly pedestalKey?: string | null;
  /** `CharacterConfig.aura`, or `User.activeAura`. */
  readonly aura?: string | null;
  /** `CharacterConfig.relic`, or the legacy `weapon`. */
  readonly relic?: string | null;
  readonly weapon?: string | null;
  /** The legacy `accessory` field, which has no catalogue entries yet. */
  readonly accessory?: string | null;
  /**
   * The Pixel Display density preset.
   *
   * Read here so a composition can be resolved for a *preview* at the density a
   * scholar has chosen. The display itself is told the resolution; the resolver
   * only needs to know it exists, because density affects how the composition is
   * rasterised and never where its parts attach.
   */
  readonly density?: string | null;
  readonly displayBorder?: string | null;
  readonly pixelGap?: number | null;
}

/** A slot that had to fall back, and why. */
export interface DegradedSlot {
  readonly slot: string;
  readonly key: string;
  readonly reason: "unknown-key" | "missing-asset" | "incompatible";
  readonly message: string;
}

export interface ResolvedCharacter {
  readonly composition: ModularComposition;
  /** Empty when everything resolved cleanly. */
  readonly degraded: readonly DegradedSlot[];
}

export interface ResolveCharacterOptions {
  /** Which of the base asset's states to present. */
  readonly state?: SylfState;
  /**
   * The catalogue lookup. Injected so this module does not hardcode where
   * assets come from, and so a test can supply a deliberately broken catalogue.
   */
  readonly lookup: AssetLookup;
  /**
   * The scholar's own Pixel Studio creations, as assets.
   *
   * Merged into the catalogue for this resolution so a creation can be equipped
   * as the display’s artwork. Absent, an equipped creation simply is not
   * found — which is already the safe path, because the resolver falls back to
   * an empty display and reports it.
   */
  readonly creations?: readonly PixelAsset[];
}

/**
 * Builds the composition for an equipped configuration.
 *
 * Always returns a paintable composition. An absent selection produces an empty display.
 */
export function resolveEquippedCharacter(
  config: EquippedConfig | null | undefined,
  options: ResolveCharacterOptions,
): ResolvedCharacter {
  const { lookup: baseLookup, state } = options;
  const degraded: DegradedSlot[] = [];
  const cfg = config ?? {};

  // One merged catalogue for the whole resolution, so every slot sees the
  // scholar's creations and none of them needs to know creations exist.
  const lookup: AssetLookup = options.creations?.length
    ? (id) =>
        options.creations?.find((asset) => asset.id === id) ?? baseLookup(id)
    : baseLookup;

  // ── The base figure ────────────────────────────────────────────────────────
  const formKey = cfg.outfit ?? undefined;
  const base = resolveBase(formKey, lookup, degraded);

  if (base.id === EMPTY_CHARACTER_ASSET.id) {
    return { composition: { base, baseState: state, parts: [] }, degraded };
  }

  // ── Accessories ────────────────────────────────────────────────────────────
  const parts: CompositionPart[] = [];

  const pedestalKey = cfg.pedestal ?? cfg.pedestalKey ?? undefined;
  const pedestal = resolveAccessory(
    "pedestal",
    "pedestal",
    pedestalKey ?? undefined,
    lookup,
    degraded,
  );
  if (pedestal) parts.push({ slot: "pedestal", asset: pedestal });

  // `weapon` is the legacy alias for `relic`; the relic wins when both are set,
  // preserving the existing configuration precedence.
  const relicKey = cfg.relic ?? cfg.weapon ?? undefined;
  const relic = resolveAccessory("held", "relic", relicKey ?? undefined, lookup, degraded);
  if (relic) parts.push({ slot: "held", asset: relic });

  const outfit = resolveAccessory(
    "wearable",
    "outfit",
    cfg.accessory ?? undefined,
    lookup,
    degraded,
  );
  if (outfit) parts.push({ slot: "wearable", asset: outfit });

  const aura = resolveAccessory(
    "aura",
    "aura",
    cfg.aura ?? undefined,
    lookup,
    degraded,
  );
  if (aura) parts.push({ slot: "aura", asset: aura });

  return {
    composition: {
      base,
      baseState: state,
      parts: parts.filter(part => {
        if (resolveAttachment(base, part.asset).resolved) return true;
        degraded.push({ slot: part.slot, key: part.asset.id, reason: "incompatible", message: "This accessory needs an authored attachment point. Your drawing is shown without it." });
        return false;
      }),
    },
    degraded,
  };
}

function resolveBase(
  key: string | undefined,
  lookup: AssetLookup,
  degraded: DegradedSlot[],
): PixelAsset {
  const resolved = resolveCosmeticKey("form", key);

  if (resolved.kind === "asset") {
    const asset = lookup(resolved.assetId);
    if (asset?.id.startsWith("user:") && asset.kind === "character") return asset;
    degraded.push({
      slot: "form",
      key: key ?? "",
      reason: "missing-asset",
      message: `Form key ${JSON.stringify(key)} maps to asset ${resolved.assetId}, which is not in the catalogue. Choose one of your saved drawings.`,
    });
  } else if (resolved.kind === "unknown" && key) {
    degraded.push({
      slot: "form",
      key,
      reason: "unknown-key",
      message: `Form key ${JSON.stringify(key)} is not in the registry. Choose one of your saved drawings.`,
    });
  }

  // The surface presents an invitation or a neutral placeholder for this asset.
  return EMPTY_CHARACTER_ASSET;
}

/**
 * An accessory slot.
 *
 * Returns `null` for both "deliberately unequipped" and "unrecognised", because
 * the correct visual outcome is identical. The *difference* is reported, so a
 * surface can distinguish "no aura" from "an aura from a newer build".
 */
function resolveAccessory(
  slot: CompositionPart["slot"],
  registrySlot: "pedestal" | "relic" | "outfit" | "aura",
  key: string | undefined,
  lookup: AssetLookup,
  degraded: DegradedSlot[],
): PixelAsset | null {
  const resolved = resolveCosmeticKey(registrySlot, key);

  if (resolved.kind === "unequipped") return null;

  if (resolved.kind === "unknown") {
    if (key) {
      degraded.push({
        slot,
        key,
        reason: "unknown-key",
        message: `${registrySlot} key ${JSON.stringify(key)} is not in the registry, so nothing is shown for it.`,
      });
    }
    return null;
  }

  const asset = lookup(resolved.assetId);
  if (!asset) {
    degraded.push({
      slot,
      key: key ?? "",
      reason: "missing-asset",
      message: `${registrySlot} key ${JSON.stringify(key)} maps to asset ${resolved.assetId}, which is not in the catalogue.`,
    });
    return null;
  }
  return asset;
}

/** Every asset the resolver can produce, for validation and tooling. */
export const RESOLVER_ASSETS = [
  EMPTY_CHARACTER_ASSET,
  MEADOW_PEDESTAL_ASSET,
  EMBER_AURA_ASSET,
] as const;

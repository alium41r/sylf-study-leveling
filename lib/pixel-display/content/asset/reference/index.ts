/** Optional accessories for user artwork. This catalogue contains no characters. */

import { EMBER_AURA_ASSET } from "./ember-aura";
import { MEADOW_PEDESTAL_ASSET } from "./pedestal-meadow";
import { PRACTICE_WAND_ASSET } from "./practice-wand";
import { STUDY_SCARF_ASSET } from "./study-scarf";
import { EMPTY_CHARACTER_ASSET } from "../empty";
import type { PixelAsset, PixelAssetKind } from "../types";

export {
  EMBER_AURA_ASSET,
  MEADOW_PEDESTAL_ASSET,
  PRACTICE_WAND_ASSET,
  STUDY_SCARF_ASSET,
};

/**
 * Every built-in asset, in a stable order.
 *
 * A single list rather than a directory scan: the built-in catalogue is small,
 * explicit, and bundled — an author adding an asset adds one import here, and
 * `validateCatalogue` proves the addition is well-formed.
 */
export const REFERENCE_ASSETS: readonly PixelAsset[] = [
  STUDY_SCARF_ASSET,
  PRACTICE_WAND_ASSET,
  MEADOW_PEDESTAL_ASSET,
  EMBER_AURA_ASSET,
];

/** Every asset of one kind. How review tooling filters the catalogue. */
export function assetsOfKind(kind: PixelAssetKind): readonly PixelAsset[] {
  return REFERENCE_ASSETS.filter((asset) => asset.kind === kind);
}

/** One asset by id, or `undefined`. */
export function findAsset(id: string): PixelAsset | undefined {
  return REFERENCE_ASSETS.find((asset) => asset.id === id);
}

/** The asset and the state a caller means when they name neither. */
export const DEFAULT_ASSET_ID = EMPTY_CHARACTER_ASSET.id;

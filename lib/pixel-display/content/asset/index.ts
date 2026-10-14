/**
 * ============================================================================
 * PIXEL ASSET — PUBLIC SURFACE
 * ============================================================================
 * Everything an author or a tool needs, and nothing an engine needs.
 *
 * This module is content-layer code. It does not import the renderer, the
 * runtime, React, the DOM, or any application module, and the architecture tests
 * assert that — so an asset author cannot accidentally depend on how a frame is
 * scheduled or rasterised.
 * ============================================================================
 */

export {
  PIXEL_ASSET_VERSION,
  TRANSPARENT_TOKEN,
  type PixelAnchor,
  type PixelAsset,
  type PixelAssetKind,
  type PixelAssetState,
  type PixelAttachment,
  type PixelGeometry,
  type PixelPalette,
  type PixelPlane,
  type PixelRasterGeometry,
  type PixelSpanGeometry,
  type PixelSpanRow,
} from "./types";

export {
  SHADED_DEEP_SHARE,
  SHADED_HIGHLIGHT_SHARE,
  countCells,
  createAssetLookup,
  defaultStateId,
  findState,
  mergedPalette,
  planeIdsForState,
  resolveAsset,
  resolveGeometry,
  type ResolvedCell,
  type ResolvedPlane,
} from "./resolve";

export {
  DEFAULT_HORIZONTAL_BIAS,
  DEFAULT_SCALE_SHARE,
  DEFAULT_VERTICAL_BIAS,
  cellsFor,
  paintAsset,
  placementFor,
  referenceCellRect,
  referenceToLogical,
  type AssetPlacement,
  type PaintAssetOptions,
  type PaintAssetResult,
} from "./paint";

export {
  MAX_ASSET_CELLS,
  MAX_REFERENCE_SIDE,
  assertValidAsset,
  validateAsset,
  type PixelAssetIssue,
  type PixelAssetIssueCode,
} from "./validate";

export {
  COMPOSITION_SLOTS,
  compositionAnchors,
  paintComposition,
  type ComposedPart,
  type CompositionPart,
  type CompositionResult,
  type CompositionSlot,
  type ModularComposition,
} from "./compose";

export type { SylfState } from "../sylf/frames";

export {
  CREATION_ALLOWED_SIZES,
  MAX_CREATION_COLORS,
  MAX_CREATION_FRAMES,
  MAX_FRAME_MS,
  MAX_PAYLOAD_BYTES,
  MAX_TOTAL_MS,
  MIN_FRAME_MS,
  PALETTE_DIGITS,
  PIXEL_CREATION_VERSION,
  approximatePayloadBytes,
  assertValidCreation,
  decodeFrame,
  emptyFrame,
  encodeFrame,
  isDrawableCreation,
  hasCreationPixels,
  validateCreation,
  type CellValue,
  type CreationFrame,
  type CreationIssue,
  type CreationIssueCode,
  type CreationPlayback,
  type CreationSize,
  type PixelCreation,
} from "./creation";

export {
  CREATION_PLANE_ID,
  creationAssetOrFallback,
  creationToAsset,
} from "./creation-asset";

export {
  resolveAttachment,
  type AttachmentProblem,
  type AttachmentResult,
  type ResolvedAttachment,
} from "./attachment";

export type { AssetLookup } from "./types";

export {
  DEFAULT_ASSET_ID,
  EMBER_AURA_ASSET,
  MEADOW_PEDESTAL_ASSET,
  PRACTICE_WAND_ASSET,
  REFERENCE_ASSETS,
  STUDY_SCARF_ASSET,
  assetsOfKind,
  findAsset,
} from "./reference";

export { EMPTY_CHARACTER_ASSET } from "./empty";

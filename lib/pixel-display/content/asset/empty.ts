import { PIXEL_ASSET_VERSION, type PixelAsset } from './types';

/** A paintable empty composition, never a substitute character. */
export const EMPTY_CHARACTER_ASSET: PixelAsset = {
  version: PIXEL_ASSET_VERSION,
  id: 'pixel:empty',
  kind: 'character',
  name: 'No artwork',
  reference: { width: 32, height: 32 },
  palette: {},
  planes: [{ id: 'empty', geometry: { geometry: 'raster', rows: Array.from({ length: 32 }, () => '.'.repeat(32)) } }],
  anchors: [],
};

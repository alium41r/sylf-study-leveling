import type { PixelAsset } from './types';

// Assets are immutable. Cache a complete identity once per object, including
// artwork/timing; an ID alone never identifies a content revision.
const identities = new WeakMap<PixelAsset, string>();
export function assetContentIdentity(asset: PixelAsset): string {
  let identity = identities.get(asset);
  if (identity === undefined) {
    identity = JSON.stringify(asset);
    identities.set(asset, identity);
  }
  return identity;
}

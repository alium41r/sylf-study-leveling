import type { PixelCreation } from './pixel-display/content/asset';
/** A permitted user's equipped art, never their private library or editor draft. */
export interface SelectedPixelCompanion {
 ownerId: number;
 config: Record<string, unknown> | null;
 creation: PixelCreation | null;
 revision: number | null;
 unavailable: boolean;
}

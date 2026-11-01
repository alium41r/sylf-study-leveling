// The switcher's decisions, kept apart from its drawing so they can be tested without a renderer.
import type { SpaceId } from "./contracts";

export const SPACE_LABELS: Record<SpaceId, string> = { home: "Home", workspace: "Workspace", world: "World" };

/** Where a Space sits in the bar. Transitions move in this direction, so the Spaces feel side by side. */
export function transitionDirection(spaces: readonly SpaceId[], from: SpaceId, to: SpaceId): -1 | 0 | 1 {
  const delta = spaces.indexOf(to) - spaces.indexOf(from);
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

/** Arrow keys wrap, Home and End jump. Returns the tab to focus, or null when the key is not a navigation key. */
export function tabForKey(key: string, current: number, count: number): number | null {
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

export interface SwitcherFit { width: number; labelled: boolean }

/**
 * The bar must never leave the window. Labels are dropped before the bar is, because the icons and their accessible names
 * still work. `labelled` and `iconOnly` are full bar widths; `room` is the width the window can offer.
 */
export function fitSwitcher({ labelled, iconOnly, room }: { labelled: number; iconOnly: number; room: number }): SwitcherFit {
  return labelled <= room ? { width: labelled, labelled: true } : { width: Math.min(iconOnly, room), labelled: false };
}

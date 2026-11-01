// Decides how much of each tool stays alive (master plan §2.2). A window's frame always exists. What changes is its content:
// `active` and `visible` content runs and is seen; `background` content stays mounted, out of sight and still, because mounting
// costs native memory that is not all returned (risk R15); `suspended` content is gone, and its small state is in the snapshot.
import { OVERVIEW_ZOOM, intersects, visibleWorld, type Size } from "./canvas";
import { openWindows, type WorkspaceState } from "./windows";

export type ToolLifecycle = "active" | "visible" | "background" | "suspended";

/** How much content may be alive: `seen` on screen at once and `warm` kept for a quick return. */
export interface LifecycleBudget { seen: number; warm: number }
export const DEFAULT_BUDGET: LifecycleBudget = { seen: 8, warm: 3 };

/** Windows this close to the view count as seen, so a small pan does not start and stop their tools. */
export const VIEW_MARGIN = 160;

export function seenWindowIds(state: WorkspaceState, viewport: Size): string[] {
  if (state.camera.zoom < OVERVIEW_ZOOM) return [];
  const view = visibleWorld(state.camera, viewport);
  return openWindows(state).filter((window) => intersects(window, view, VIEW_MARGIN)).map((window) => window.id);
}

/** Most recently used first, so what was just used is the last to go. Anything over budget is suspended. */
export function planLifecycles(state: WorkspaceState, seen: readonly string[], budget: LifecycleBudget = DEFAULT_BUDGET): Record<string, ToolLifecycle> {
  const plan: Record<string, ToolLifecycle> = {};
  const seenSet = new Set(seen);
  let seenLeft = budget.seen;
  let warmLeft = budget.warm;
  for (const id of state.recent) {
    if (seenSet.has(id) && seenLeft > 0) { seenLeft--; plan[id] = id === state.focused ? "active" : "visible"; continue; }
    if (warmLeft > 0) { warmLeft--; plan[id] = "background"; continue; }
    plan[id] = "suspended";
  }
  return plan;
}

// Where the timer dock goes, with no UI, so every window shape can be tested without a renderer. It rests on the same line as the Spaces
// icon, in the middle of the window. A compact window has no middle to spare, because Home's strip shares that line, so there it goes to
// the right. It opens downward and never leaves the window or its safe area.
export const DOCK_PANEL_WIDTH = 372;
const COMPACT_WIDTH = 600;

export interface DockFrame {
  window: { width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
  /** The top of the corner controls. */
  top: number;
  edge: number;
  control: number;
  gap: number;
  /** The dock at rest. */
  restWidth: number;
  /** Width kept clear on the right of the same line, for the development entry. */
  reservedRight: number;
}

export interface DockPlacement {
  restLeft: number;
  panelLeft: number;
  panelWidth: number;
  panelMaxHeight: number;
  /** Where the middle of the resting dock falls across the panel, 0 to 1. The panel grows from there. */
  panelOrigin: number;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function placeDock({ window, insets, top, edge, control, gap, restWidth, reservedRight }: DockFrame): DockPlacement {
  const bandLeft = insets.left + edge + control + gap;
  const bandRight = window.width - insets.right - edge - reservedRight;
  const middle = window.width < COMPACT_WIDTH ? Infinity : window.width / 2 - restWidth / 2;
  const restLeft = clamp(middle, bandLeft, Math.max(bandLeft, bandRight - restWidth));
  const sideLeft = insets.left + edge;
  const panelWidth = Math.min(DOCK_PANEL_WIDTH, window.width - insets.left - insets.right - edge * 2);
  const panelLeft = clamp(restLeft + restWidth / 2 - panelWidth / 2, sideLeft, Math.max(sideLeft, window.width - insets.right - edge - panelWidth));
  return { restLeft, panelLeft, panelWidth, panelMaxHeight: Math.max(120, window.height - top - insets.bottom - edge), panelOrigin: clamp((restLeft + restWidth / 2 - panelLeft) / panelWidth, 0, 1) };
}

/** Which Space a shortcut's digit means. Spaces missing here, on a phone say, have no shortcut. */
export function spaceForDigit<T>(digit: string, spaces: readonly T[]): T | null {
  return spaces[Number(digit) - 1] ?? null;
}

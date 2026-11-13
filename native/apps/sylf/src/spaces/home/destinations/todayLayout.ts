// How the dashboard arranges its four parts for the room it has, worked out apart from the screen so it is tested without one. The width is the page's own
// content width, inside the rail, the padding and the safe areas: never the window's, and never the device's kind.
export type TodayLayout = "grid" | "paired" | "stack";

/** Two columns need this much, or the island and the social column squeeze the words beside them. */
export const GRID_MIN = 880;
/** Progress and the island sit side by side from here. Below it everything is one column. */
export const PAIRED_MIN = 560;
/** The left column's share of a row, in flex units: words and lists get a little more than the picture and the people. */
export const GRID_FLEX = { left: 6, right: 5 } as const;

export function todayLayout(contentWidth: number): TodayLayout {
  return contentWidth >= GRID_MIN ? "grid" : contentWidth >= PAIRED_MIN ? "paired" : "stack";
}

/** The island's box. It follows the column it sits in, within limits, so it is never a postage stamp and never taller than the progress beside it. */
export function islandBox(layout: TodayLayout, contentWidth: number, gap: number): { width: number; height: number } {
  if (layout === "grid") {
    const width = Math.floor(((contentWidth - gap) * GRID_FLEX.right) / (GRID_FLEX.left + GRID_FLEX.right));
    return { width, height: Math.round(Math.min(400, Math.max(260, width * 0.74))) };
  }
  if (layout === "paired") {
    const width = Math.round(Math.min(300, Math.max(200, contentWidth * 0.38)));
    return { width, height: Math.round(width * 0.78) };
  }
  const width = Math.max(0, contentWidth);
  return { width, height: Math.round(Math.min(220, Math.max(150, width * 0.5))) };
}

/** The left margin that puts a centred child's middle at `centre` in a row `width` wide. Zero when the centre is the row's own, or left of it. */
export const hubOffset = (centre: number | undefined, width: number) => (centre === undefined ? 0 : Math.max(0, Math.round(2 * centre - width)));

/** The middle of the gutter between two columns that share a row `width` wide by flex, with `gap` between them. */
export const gutterCentre = (width: number, split: { left: number; right: number; gap: number }) => ((width - split.gap) * split.left) / (split.left + split.right) + split.gap / 2;

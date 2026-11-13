import type { Box } from "./page-pinch";

/** The first page under the upper third of the view, including when scrolling into the pull area below the last page. */
export function pageAt(rows: readonly Box[], scrollY: number, viewHeight: number) {
  const index = rows.findIndex((row) => row.top + row.height > scrollY + viewHeight / 3);
  return index < 0 ? Math.max(0, rows.length - 1) : index;
}

/** Put the selected page at the top, or as close as the document can scroll. */
export function pageOffset(row: Box, gap: number, contentHeight: number, viewHeight: number) {
  return Math.max(0, Math.min(row.top - gap, contentHeight - viewHeight));
}

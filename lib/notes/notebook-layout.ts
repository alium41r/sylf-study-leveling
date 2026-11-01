import type { DocumentDescriptor } from "./contracts";

export const NOTEBOOK_GAP = 24;
export type NotebookPageLayout = {
  pageId: string;
  top: number;
  height: number;
  width: number;
};
/** Cheap geometry for every page; native editors exist only in the visible window. */
export function notebookLayout(
  pages: DocumentDescriptor["pages"],
  zoom: number,
  gap = NOTEBOOK_GAP
) {
  let top = gap;
  const items: NotebookPageLayout[] = [];
  for (const page of pages) {
    if (page.extensions.archived) continue;
    const height = Math.round(page.height * zoom);
    items.push({ pageId: page.pageId, top, height, width: page.width * zoom });
    top += height + gap;
  }
  return { items, height: top };
}
export function notebookWindow(
  items: NotebookPageLayout[],
  scroll: number,
  height: number
) {
  // Binary search avoids walking a large notebook on every scroll frame.
  let lo = 0,
    hi = items.length;
  const start = Math.max(0, scroll - height / 2),
    end = scroll + height * 1.5;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (items[mid].top + items[mid].height < start) lo = mid + 1;
    else hi = mid;
  }
  const visible: NotebookPageLayout[] = [];
  for (let i = lo; i < items.length && items[i].top <= end; i++)
    visible.push(items[i]);
  return visible;
}

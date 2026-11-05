// Drag and drop is a desktop gesture here: on a tablet a long press opens a menu with "Open in a new window" instead, because a
// drag already moves windows and pages. These hooks do nothing off the web.
import type { RefObject } from "react";
import type { ViewHandle } from "@sylf/design-system";

export interface DropHandlers { onPdf?(file: { bytes: Uint8Array; name: string }, at: { x: number; y: number }): void; onDocument?(id: string, at: { x: number; y: number }): void }
export const DOCUMENT_DRAG_TYPE = "application/x-sylf-note";
export function useDropTarget(target: RefObject<ViewHandle | null>, handlers: DropHandlers) { void target; void handlers; }
export function useDragSource(target: RefObject<ViewHandle | null>, documentId: string | null) { void target; void documentId; }

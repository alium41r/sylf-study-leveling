// Desktop drag and drop: PDF files from the system, and library cards dragged out of a window onto the canvas. The drop point is
// reported in the target's own coordinates; the Workspace turns it into a place on the canvas.
import { useEffect, useRef, type RefObject } from "react";
import type { ViewHandle } from "@sylf/design-system";
import type { DropHandlers } from "./drop";

export const DOCUMENT_DRAG_TYPE = "application/x-sylf-note";
const TYPE = DOCUMENT_DRAG_TYPE;

export function useDropTarget(target: RefObject<ViewHandle | null>, handlers: DropHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const node = target.current as unknown as HTMLElement | null;
    if (!node) return;
    const wanted = (event: DragEvent) => !!event.dataTransfer && (event.dataTransfer.types.includes(TYPE) || event.dataTransfer.types.includes("Files"));
    const over = (event: DragEvent) => { if (!wanted(event)) return; event.preventDefault(); event.dataTransfer!.dropEffect = "copy"; };
    const drop = (event: DragEvent) => {
      if (!wanted(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const box = node.getBoundingClientRect(), at = { x: event.clientX - box.left, y: event.clientY - box.top };
      const id = event.dataTransfer!.getData(TYPE);
      if (id) { latest.current.onDocument?.(id, at); return; }
      for (const file of Array.from(event.dataTransfer!.files)) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;
        void file.arrayBuffer().then((buffer) => latest.current.onPdf?.({ bytes: new Uint8Array(buffer), name: file.name }, at));
      }
    };
    node.addEventListener("dragover", over);
    node.addEventListener("drop", drop);
    return () => { node.removeEventListener("dragover", over); node.removeEventListener("drop", drop); };
  }, [target]);
}

export function useDragSource(target: RefObject<ViewHandle | null>, documentId: string | null) {
  useEffect(() => {
    const node = target.current as unknown as HTMLElement | null;
    if (!node || !documentId) return;
    node.draggable = true;
    const start = (event: DragEvent) => { event.dataTransfer?.setData(TYPE, documentId); event.dataTransfer!.effectAllowed = "copy"; };
    node.addEventListener("dragstart", start);
    return () => { node.draggable = false; node.removeEventListener("dragstart", start); };
  }, [target, documentId]);
}

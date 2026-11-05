// Opening a library document in a window of its own: the right tool for its kind, at a place on the canvas or wherever placement
// finds room. An open window on the same document is brought forward instead of opening a second.
import type { LibraryEntry, NoteKind } from "@sylf/notes";
import type { ToolId, WorkspaceModel } from "@sylf/spaces";

export const toolForKind = (kind: NoteKind): ToolId => (kind === "pdf" ? "pdfs" : kind === "board" ? "whiteboard" : "notes");

export function openDocumentWindow(model: WorkspaceModel, entry: Pick<LibraryEntry, "id" | "kind" | "title">, at: { x: number; y: number } | null, reuse = true): boolean {
  const tool = toolForKind(entry.kind);
  const existing = reuse ? model.state().windows.find((w) => w.tool === tool && w.state.document === entry.id) : undefined;
  if (existing) {
    if (existing.minimized) model.restore(existing.id);
    if (at) model.move(existing.id, at.x, at.y);
    model.focus(existing.id);
    model.reveal(existing.id);
    return true;
  }
  const id = model.open(tool, { document: entry.id, title: entry.title });
  if (!id) return false;
  if (at) { model.move(id, at.x, at.y); model.reveal(id); }
  return true;
}

/** Opens a document just to the right of a window, the way a study pair sits: the paper on one side, notes on the other. */
export function openBeside(model: WorkspaceModel, besideId: string, entry: Pick<LibraryEntry, "id" | "kind" | "title">): boolean {
  const beside = model.state().windows.find((w) => w.id === besideId);
  return openDocumentWindow(model, entry, beside ? { x: beside.x + beside.width + 28, y: beside.y } : null);
}

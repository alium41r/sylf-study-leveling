// What a document's chrome reads from a page of ink: whether there is something to undo or redo, the paper, and where the ink ends.
// Ink changes many times a second while the pen or the eraser moves; the editor around it renders again only when one of these does.
import type { InkScene } from "@sylf/notes";

export function sceneFace(scene: InkScene): string {
  try {
    const paper = scene.paper(), strokes = scene.strokes();
    let bottom = 0;
    for (const stroke of strokes) bottom = Math.max(bottom, stroke.bounds.y + stroke.bounds.height);
    return `${scene.canUndo() ? 1 : 0}${scene.canRedo() ? 1 : 0}|${paper.template}|${paper.color}|${paper.rule}|${paper.spacing}|${strokes.length ? Math.ceil(bottom / 16) : -1}`;
  } catch {
    // A damaged page reports through the surface that draws it; the chrome only needs to render once more.
    return "unreadable";
  }
}

/**
 * Calls `onChange` when the scene's face changes, never for ink that leaves it as it was. The face is read just after the
 * change rather than during it: undo history is updated once the edit has been applied, and a burst of changes is read once.
 */
export function watchScene(scene: InkScene, onChange: () => void) {
  let face = sceneFace(scene), queued = false, live = true;
  const check = () => {
    queued = false;
    if (!live) return;
    const next = sceneFace(scene);
    if (next === face) return;
    face = next;
    onChange();
  };
  const stop = scene.subscribe(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(check);
  });
  return () => { live = false; stop(); };
}

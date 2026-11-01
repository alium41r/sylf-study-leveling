import * as Y from "yjs";
import { z } from "zod";
import type { DocumentDescriptor } from "./contracts";
import { pageTextOrigin } from "./page-layers";
import { NotesError } from "./errors";
const position = z.number().finite().min(0).max(100000);
export const textBoxSchema = z
  .object({
    id: z.string().regex(/^(body|box-[0-9a-f-]{36})$/),
    x: position,
    y: position,
    width: z.number().min(120).max(100000),
    height: z.number().min(60).max(100000),
    kind: z.enum(["text", "image"]).default("text"),
    assetId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    removed: z.boolean().optional(),
    order: z.number().int().min(-1000000).max(1000000).optional(),
  })
  .strict();
export type TextBox = z.infer<typeof textBoxSchema>;
export function storedTextBoxes(doc: Y.Doc): TextBox[] {
  const records = doc.getMap("text-boxes");
  if (records.size > 64)
    throw new NotesError(
      "LIMIT",
      "This page has too many retained text boxes. Original content is retained."
    );
  return [...records.entries()].map(([id, value]) => {
    const parsed = textBoxSchema.safeParse(value);
    if (!parsed.success || parsed.data.id !== id)
      throw new NotesError(
        "CORRUPT",
        "This page contains unsupported box geometry. Export recovery before repairing."
      );
    return parsed.data;
  });
}
export function textFragments(doc: Y.Doc) {
  return [
    "body",
    ...storedTextBoxes(doc)
      .filter((b) => b.id !== "body" && b.kind === "text" && !b.removed)
      .map((b) => b.id),
  ];
}
export class PageBoxes {
  readonly map: Y.Map<unknown>;
  readonly undo: Y.UndoManager;
  private readonly origin = {};
  constructor(
    readonly doc: Y.Doc,
    public page: DocumentDescriptor["pages"][number],
    private readonly writable: () => boolean
  ) {
    this.map = doc.getMap("text-boxes");
    this.undo = new Y.UndoManager(this.map, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
  }
  boxes() {
    const boxes = storedTextBoxes(this.doc);
    if (!boxes.some((b) => b.id === "body")) {
      const p = pageTextOrigin(this.page);
      boxes.unshift({
        id: "body",
        kind: "text",
        ...p,
        width: Math.max(160, this.page.width - p.x - 64),
        height: 100,
      });
    }
    return boxes
      .filter((b) => !b.removed)
      .sort(
        (a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id)
      );
  }
  set(value: TextBox) {
    if (!this.writable())
      throw new NotesError(
        "CONFLICT",
        "Retry saving before arranging content."
      );
    const box = textBoxSchema.parse(value);
    if (!this.map.has(box.id) && this.map.size >= 64)
      throw new NotesError(
        "LIMIT",
        "Use another page for more boxes. Existing boxes are safely retained."
      );
    this.doc.transact(() => this.map.set(box.id, box), this.origin);
  }
  /** Natural text height is geometry, not an arrangement undo step. Persist it
   * so copying an offscreen long box still grows its destination before print. */
  measure(id: string, height: number) {
    if (!this.writable()) return;
    const box = this.boxes().find((b) => b.id === id);
    if (!box || box.kind !== "text" || height <= box.height + 1) return;
    const next = textBoxSchema.parse({ ...box, height: Math.ceil(height) });
    this.doc.transact(() => this.map.set(id, next), "notes-content-measure");
  }
  add(
    x: number,
    y: number,
    image?: { assetId: string; width: number; height: number },
    id = "box-" + crypto.randomUUID()
  ) {
    const width = Math.min(image?.width || 300, this.page.width - 40);
    this.set({
      id,
      order: Math.max(0, ...this.boxes().map((box) => box.order || 0)) + 1,
      kind: image ? "image" : "text",
      x: Math.max(20, Math.min(this.page.width - width - 20, x)),
      y: Math.max(20, y),
      width,
      height: image ? Math.max(60, (width * image.height) / image.width) : 100,
      ...(image ? { assetId: image.assetId } : {}),
    });
    return id;
  }
  close() {
    this.undo.destroy();
  }
}

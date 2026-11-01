import * as Y from "yjs";
import { z } from "zod";
import { idSchema, type DocumentDescriptor } from "./contracts";
import { NotesError } from "./errors";

export const PDF_ADAPTER = "sylf-pdf/1";
export const PDF_LIMITS = {
  fileBytes: 50 * 1024 * 1024,
  importedPages: 500,
  documentPages: 1000,
  exportSourceBytes: 128 * 1024 * 1024,
  exportSamples: 1_000_000,
  exportMarks: 50_000,
  exportTextPixels: 32_000_000,
  marks: 10000,
  searchCharacters: 8_000_000,
};
export type NotesPage = DocumentDescriptor["pages"][number];
export const matrixSchema = z
  .tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ])
  .refine(
    (m) =>
      Number.isFinite(m[0] * m[3] - m[1] * m[2]) &&
      Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-12,
    "Invalid PDF coordinate transform"
  );
export type PdfMatrix = z.infer<typeof matrixSchema>;
export const pdfSourcePageSchema = z
  .object({
    width: z.number().positive().max(100000),
    height: z.number().positive().max(100000),
    transform: matrixSchema,
    rotation: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
  })
  .strict();
export type PdfSourcePage = z.infer<typeof pdfSourcePageSchema>;
export function pdfRotation(page: NotesPage) {
  return z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .parse(page.extensions.pdfRotation ?? 0);
}
export function pdfMatrix(page: NotesPage): PdfMatrix {
  return page.originalAssetId
    ? matrixSchema.parse(page.extensions.pdfTransform)
    : [1, 0, 0, -1, 0, page.height];
}
export function inverseMatrix(m: PdfMatrix): PdfMatrix {
  const [a, b, c, d, e, f] = matrixSchema.parse(m),
    n = a * d - b * c;
  return [
    d / n,
    -b / n,
    -c / n,
    a / n,
    (c * f - d * e) / n,
    (b * e - a * f) / n,
  ];
}
export function transformPoint(m: PdfMatrix, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
export function pageRotationMatrix(
  width: number,
  height: number,
  rotation: number
): PdfMatrix {
  switch (rotation) {
    case 0:
      return [1, 0, 0, 1, 0, 0];
    case 90:
      return [0, 1, -1, 0, height, 0];
    case 180:
      return [-1, 0, 0, -1, width, height];
    case 270:
      return [0, -1, 1, 0, 0, width];
    default:
      throw new NotesError(
        "CORRUPT",
        "Invalid page rotation; originals were retained."
      );
  }
}
export function displayedPageSize(page: NotesPage) {
  const sideways = pdfRotation(page) % 180 !== 0;
  return {
    width: sideways ? page.height : page.width,
    height: sideways ? page.width : page.height,
  };
}
export const pdfRectSchema = z
  .object({
    x: z.number().finite().min(-100000).max(100000),
    y: z.number().finite().min(-100000).max(100000),
    width: z.number().positive().max(100000),
    height: z.number().positive().max(100000),
  })
  .strict();
export type PdfRect = z.infer<typeof pdfRectSchema>;
export const pdfMarkSchema = z
  .object({
    id: idSchema,
    target: idSchema,
    clock: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    kind: z.enum(["text", "comment", "highlight", "underline", "strikeout"]),
    rects: z.array(pdfRectSchema).min(1).max(500),
    text: z.string().max(2000),
    color: z.string().regex(/^#[\da-f]{6}$/i),
    size: z.number().min(8).max(48),
    deleted: z.boolean().default(false),
  })
  .strict();
export type PdfMark = z.infer<typeof pdfMarkSchema>;
export type PdfMarkInput = Omit<
  PdfMark,
  "id" | "clock" | "target" | "deleted"
> & { target?: string; deleted?: boolean };
/** Append-only markup events. Concurrent alternatives stay in the native journal/history. */
export class PdfMarkup {
  private readonly records: Y.Map<unknown>;
  private readonly origin = Symbol("pdf-markup");
  readonly undo: Y.UndoManager;
  private clock = 0;
  private readonly parsed = new Map<string, PdfMark>();
  private readonly listeners = new Set<() => void>();
  private failure?: Error;
  constructor(
    readonly doc: Y.Doc,
    private readonly writable: () => boolean = () => true
  ) {
    this.records = pdfPageMaps(doc).markup;
    if (this.records.size > PDF_LIMITS.marks)
      throw new NotesError(
        "LIMIT",
        "This page has too many markup records. Export the original for recovery."
      );
    for (const [key, value] of this.records) this.parse(key, value);
    this.assertHealthy();
    this.undo = new Y.UndoManager(this.records, {
      trackedOrigins: new Set([this.origin]),
      captureTimeout: 0,
    });
    this.records.observe(this.observe);
  }
  private parse(key: string, value: unknown) {
    try {
      const mark = pdfMarkSchema.parse(value);
      if (key !== mark.id) throw new Error("Markup identity mismatch");
      this.parsed.set(key, mark);
      this.clock = Math.max(this.clock, mark.clock);
    } catch {
      this.failure = new NotesError(
        "CORRUPT",
        "PDF markup needs recovery. Original records were retained; writing is paused."
      );
    }
  }
  private observe = (event: Y.YMapEvent<unknown>) => {
    if (this.records.size > PDF_LIMITS.marks) {
      this.failure = new NotesError(
        "LIMIT",
        "Merged markup exceeds this page's limit. Original records were retained; writing is paused."
      );
      for (const f of this.listeners) f();
      return;
    }
    for (const key of event.keysChanged) {
      if (this.records.has(key)) this.parse(key, this.records.get(key));
      else this.parsed.delete(key);
    }
    for (const f of this.listeners) f();
  };
  assertHealthy() {
    if (this.failure) throw this.failure;
  }
  marks() {
    this.assertHealthy();
    const latest = new Map<string, PdfMark>();
    for (const m of [...this.parsed.values()].sort(
      (a, b) => a.clock - b.clock || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    ))
      latest.set(m.target, m);
    return [...latest.values()].filter((m) => !m.deleted);
  }
  put(input: PdfMarkInput) {
    this.assertHealthy();
    if (!this.writable())
      throw new NotesError(
        "CONFLICT",
        "Annotations are paused. Retry saving or export recovery."
      );
    if (this.parsed.size >= PDF_LIMITS.marks)
      throw new NotesError(
        "LIMIT",
        "This page has reached its markup limit. Original history is retained."
      );
    const id = crypto.randomUUID();
    const mark = pdfMarkSchema.parse({
      ...input,
      id,
      target: input.target || id,
      clock: ++this.clock,
    });
    this.doc.transact(() => this.records.set(id, mark), this.origin);
    return mark.target;
  }
  remove(mark: PdfMark) {
    return this.put({ ...mark, deleted: true });
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  close() {
    this.records.unobserve(this.observe);
    this.undo.destroy();
    this.listeners.clear();
  }
}

export function layoutPdfPages(pages: NotesPage[], zoom: number) {
  let offset = 24;
  const rows = [];
  for (const page of pages) {
    const size = displayedPageSize(page);
    rows.push({
      page,
      top: offset,
      width: size.width * zoom,
      height: size.height * zoom,
    });
    offset += size.height * zoom + 24;
  }
  return rows;
}

/** Seeded once in the same atomic revision that introduces the page. */
export function initialPdfUpdate() {
  const doc = new Y.Doc();
  try {
    const root = doc.getMap("pdf"),
      ink = new Y.Map<unknown>(),
      markup = new Y.Map<unknown>();
    root.set("ink", ink);
    root.set("markup", markup);
    const id = crypto.randomUUID();
    ink.set(id, {
      kind: "paper",
      id,
      clock: 1,
      paper: {
        template: "blank",
        color: "#ffffff",
        rule: "#d9dfea",
        spacing: 28,
      },
    });
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}
export function pdfPageMaps(doc: Y.Doc) {
  const root = doc.getMap("pdf"),
    ink = root.get("ink"),
    markup = root.get("markup");
  if (!(ink instanceof Y.Map) || !(markup instanceof Y.Map))
    throw new NotesError(
      "CORRUPT",
      "The PDF page initialization is missing. Preserve its original history for recovery; do not seed a replacement."
    );
  return { ink: ink as Y.Map<unknown>, markup: markup as Y.Map<unknown> };
}

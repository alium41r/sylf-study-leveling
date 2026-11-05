// PDFs on Android: the system PdfRenderer through Sylf's native module (ADR 0001). Page sizes come from PdfRenderer, which matches
// pdf.js's scale-1 viewport except for UserUnit and the crop offset of the transform (Phase 2 §5.5); documents say so with
// geometry "native", so a later export can correct them. Originals are cached in the app's cache under their SHA-256.
import { nativePdf } from "@sylf/native-platform";
import type { PdfSourcePage } from "@sylf/shared";
import { sha256 } from "../../../shell/notes/hash";

export const PDF_GEOMETRY = "native" as const;

const engine = () => {
  const found = nativePdf();
  if (!found) throw new Error("Reading PDFs needs a newer build of Sylf on this device.");
  return found;
};

export async function inspectPdf(bytes: Uint8Array): Promise<PdfSourcePage[]> {
  const key = await sha256(bytes);
  const pages = await engine().prepare(key, bytes);
  return pages.map((p) => ({ width: p.width, height: p.height, transform: [1, 0, 0, -1, 0, p.height], rotation: 0 }));
}

/** Makes sure the original is in the renderer's cache, reading it from the library only when it is not. */
export async function ensurePdf(hash: string, load: () => Promise<Uint8Array | null>) {
  const pdf = engine();
  if (await pdf.has(hash)) return pdf;
  const bytes = await load();
  if (!bytes) throw new Error("The original PDF is missing.");
  await pdf.prepare(hash, bytes);
  return pdf;
}

// Without a platform renderer (tests, type checks): nothing can be read. The app always resolves the .web or .native engine.
import type { PdfSourcePage } from "@sylf/shared";

export const PDF_GEOMETRY: "pdfjs" | "native" = "native";
export async function inspectPdf(bytes: Uint8Array): Promise<PdfSourcePage[]> {
  void bytes;
  throw new Error("Reading PDFs needs the app.");
}

export const renderPdfThumbnail: (hash: string, load: () => Promise<Uint8Array | null>, index: number, pixels: number) => Promise<string> = async () => {
  throw new Error("Reading PDFs needs the app.");
};

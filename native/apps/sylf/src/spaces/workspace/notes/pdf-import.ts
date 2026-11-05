// Choosing a PDF, reading its pages and adding it to the library. The original is kept byte for byte, as an asset.
import * as DocumentPicker from "expo-document-picker";
import type { NotesLibrary } from "@sylf/notes";
import { inspectPdf, PDF_GEOMETRY } from "./pdf-engine";

async function readBytes(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const file = (asset as { file?: Blob }).file;
  if (file) return new Uint8Array(await file.arrayBuffer());
  const response = await fetch(asset.uri);
  return new Uint8Array(await response.arrayBuffer());
}

export async function importPdfFile(library: NotesLibrary, notebookId: string | null, subjectId: string | null = null): Promise<string | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];
  if ((asset.size ?? 0) > 50 * 1024 * 1024) throw new Error("Choose a PDF up to 50 MB.");
  return importPdfBytes(library, await readBytes(asset), asset.name || "Imported.pdf", notebookId, subjectId);
}

export async function importPdfBytes(library: NotesLibrary, bytes: Uint8Array, name: string, notebookId: string | null, subjectId: string | null = null) {
  if (!looksLikePdf(bytes)) throw new Error("That file is not a PDF.");
  const pages = await inspectPdf(bytes);
  return library.importPdf({ bytes, name, pages, geometry: PDF_GEOMETRY, notebookId, subjectId });
}

/** "%PDF-" in the first kilobyte, as the web checks it, without a TextDecoder (Hermes has none). */
export function looksLikePdf(bytes: Uint8Array) {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + 4 < head.length; i++) if (head[i] === 37 && head[i + 1] === 80 && head[i + 2] === 68 && head[i + 3] === 70 && head[i + 4] === 45) return true;
  return false;
}

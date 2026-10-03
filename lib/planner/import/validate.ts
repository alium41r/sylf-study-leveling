import "server-only";
import { detectImageType, MAX_UPLOAD_BYTES, validateUpload } from "@/lib/upload-security";
import type { ImportErrorCode } from "../research/contracts";

/**
 * Gate every planner-intake upload before it is stored or extracted.
 *
 * It reuses the chat upload gate unchanged for images, and adds exactly one thing the
 * chat path does not allow: PDFs, sniffed by magic bytes. The client's declared MIME is
 * advisory only — the sniffed type wins, and a declaration that contradicts the contents
 * is refused rather than trusted, because a lie about the type is the first thing a
 * hostile file tells you.
 */

const PDF_MAGIC = "%PDF-";
/** Some writers emit a little junk before the header; no more than this is tolerated. */
const MAX_LEADING_JUNK = 8;

export type SyllabusUploadValidation =
  | { ok: true; kind: "PDF" | "IMAGE"; mime: string }
  | { ok: false; code: ImportErrorCode; message: string };

function looksLikePdf(buffer: Buffer): boolean {
  const head = buffer.subarray(0, MAX_LEADING_JUNK + PDF_MAGIC.length);
  const index = head.indexOf(PDF_MAGIC);
  return index !== -1 && index <= MAX_LEADING_JUNK;
}

function declaredKind(type: string): "PDF" | "IMAGE" | null {
  const declared = (type || "").toLowerCase();
  if (declared === "application/pdf") return "PDF";
  if (declared.startsWith("image/")) return "IMAGE";
  return null;
}

const mismatch = (): SyllabusUploadValidation => ({
  ok: false,
  code: "IMPORT_UNSUPPORTED",
  message: "The file's declared type does not match its contents.",
});

export function validateSyllabusUpload(
  file: { name: string; type: string; size: number },
  buffer: Buffer
): SyllabusUploadValidation {
  // The buffer is authoritative: the client-declared size (and name) are advisory only.
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, code: "IMPORT_TOO_LARGE", message: "The file is too large (max 5 MB)." };
  }

  // A PDF is never an image, so check its magic bytes before the image gate.
  if (looksLikePdf(buffer)) {
    if (declaredKind(file.type) === "IMAGE") return mismatch();
    return { ok: true, kind: "PDF", mime: "application/pdf" };
  }

  const detected = detectImageType(buffer);
  const declared = (file.type || "").toLowerCase();
  if (declared === "application/pdf") return mismatch(); // declared PDF, actually an image

  // Images go through the shared chat-upload gate unchanged: size, magic-byte sniff and
  // the image allowlist are all reused, never weakened.
  const gate = validateUpload(file as unknown as File, buffer);
  if (!gate.ok) {
    return { ok: false, code: "IMPORT_UNSUPPORTED", message: gate.error };
  }
  if (detected && declared.startsWith("image/") && declared !== detected) return mismatch();

  return { ok: true, kind: "IMAGE", mime: gate.mime };
}

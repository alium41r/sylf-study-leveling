// ============================================================================
// Upload security helpers (S4) — used by /api/system-messages/chat.
// ============================================================================
// Server-side validation is authoritative: MIME allowlist + magic-byte
// sniffing + size cap + generated storage names. The client-provided
// filename is NEVER used as a path component.
// ============================================================================
import crypto from "crypto";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Magic-byte sniffing — real content type, not the client-provided header. */
export function detectImageType(buf: Buffer): string | null {
  if (!buf || buf.length < 3) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 6) {
    const gif = buf.toString("latin1", 0, 6);
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Server-generated, traversal-proof storage name (never uses client input). */
export function generateSafeUploadName(mime: string): string {
  const ext = MIME_EXTENSION[mime] ?? "bin";
  return `up_${Date.now()}_${crypto.randomBytes(6).toString("hex")}.${ext}`;
}

export type UploadValidation =
  | { ok: true; mime: string; filename: string }
  | { ok: false; error: string; status: number };

/**
 * Validates a client upload end-to-end:
 *   1. size ≤ MAX_UPLOAD_BYTES
 *   2. real content type sniffed from magic bytes
 *   3. sniffed type must be in the image allowlist
 * Returns a server-generated storage name on success. The original filename
 * is ignored entirely.
 */
export function validateUpload(file: File, buffer: Buffer): UploadValidation {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File is too large (max 5 MB).", status: 413 };
  }
  const detected = detectImageType(buffer);
  if (!detected || !(ALLOWED_UPLOAD_MIME as readonly string[]).includes(detected)) {
    return {
      ok: false,
      error: "Unsupported file type. Please upload a JPEG, PNG, GIF or WebP image.",
      status: 400,
    };
  }
  return { ok: true, mime: detected, filename: generateSafeUploadName(detected) };
}

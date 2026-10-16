import "server-only";
import { createHash } from "crypto";
import { validateUpload } from "@/lib/upload-security";
import { CHAT_IMAGE_LIMITS, type ImageReference } from "./image-contract";
import type { NormalizedMessagePart } from "../providers/types";

export class ChatImageError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export interface PreparedImage { buffer: Buffer; mimeType: string; name: string }

/** Decode once, reject malformed/bomb inputs, orient and strip metadata. Never upscale. */
export async function prepareChatImages(files: File[], signal?: AbortSignal): Promise<PreparedImage[]> {
  if (files.length > CHAT_IMAGE_LIMITS.count) throw new ChatImageError("Attach up to 4 images at a time.");
  if (files.reduce((sum, file) => sum + file.size, 0) > CHAT_IMAGE_LIMITS.totalBytes) throw new ChatImageError("Images must total 12 MB or less.", 413);
  const images: PreparedImage[] = [], seen = new Set<string>();
  for (const file of files) {
    signal?.throwIfAborted();
    if (!file.size || file.size > CHAT_IMAGE_LIMITS.bytes) throw new ChatImageError("Each image must be between 1 byte and 5 MB.", 413);
    const input = Buffer.from(await file.arrayBuffer());
    const validation = validateUpload(file, input);
    if (!validation.ok) throw new ChatImageError(validation.error, validation.status);
    const hash = createHash("sha256").update(input).digest("hex");
    if (seen.has(hash)) continue;
    seen.add(hash);
    try {
      const { default: sharp } = await import("sharp");
      const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning", animated: false }).rotate()
        .resize({ width: CHAT_IMAGE_LIMITS.maxSide, height: CHAT_IMAGE_LIMITS.maxSide, fit: "inside", withoutEnlargement: true });
      const mimeType = validation.mime === "image/gif" ? "image/png" : validation.mime;
      const buffer = await (mimeType === "image/jpeg" ? image.jpeg({ quality: 92 }) : mimeType === "image/webp" ? image.webp({ quality: 92 }) : image.png()).toBuffer();
      signal?.throwIfAborted();
      if (buffer.length > CHAT_IMAGE_LIMITS.bytes) throw new ChatImageError("This image is too large after processing. Crop it or choose a smaller image.", 413);
      images.push({ buffer, mimeType, name: file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 100) || "Image" });
    } catch (error) {
      if (error instanceof ChatImageError || signal?.aborted) throw error;
      throw new ChatImageError("This image could not be read. Choose a valid image under 40 megapixels.");
    }
  }
  return images;
}
export const inlineImageParts = (images: PreparedImage[]): NormalizedMessagePart[] => images.map(image => ({ inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } }));

/** Bound the body even when Content-Length is missing or dishonest. */
export async function readImageForm(request: Request): Promise<FormData> {
  const max = CHAT_IMAGE_LIMITS.totalBytes + 64 * 1024;
  if (Number(request.headers.get("content-length")) > max) throw new ChatImageError("Images must total 12 MB or less.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ChatImageError("Missing image upload.");
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const result = await reader.read(); if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > max) throw new ChatImageError("Images must total 12 MB or less.", 413);
      chunks.push(result.value);
    }
    return await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": request.headers.get("content-type") || "" } }).formData();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export function formImages(form: FormData): File[] {
  const values = [...form.getAll("images"), ...form.getAll("file")];
  if (values.some(value => typeof value === "string")) throw new ChatImageError("Invalid image upload.");
  return values as File[];
}
export function parseImageReferences(value: unknown): ImageReference[] {
  if (value === undefined || value === null || value === "") return [];
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch { throw new ChatImageError("Invalid image references."); }
  if (!Array.isArray(parsed) || parsed.length > CHAT_IMAGE_LIMITS.count || parsed.some(ref => !ref || !Number.isSafeInteger(ref.messageId) || ref.messageId <= 0 || !Number.isInteger(ref.index) || ref.index < 0 || ref.index >= CHAT_IMAGE_LIMITS.count)) throw new ChatImageError("Invalid image references.");
  return parsed.map(({ messageId, index }) => ({ messageId, index }));
}

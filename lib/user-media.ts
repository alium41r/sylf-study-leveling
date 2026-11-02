import { createHash } from "crypto";

/**
 * Threshold (in characters) above which inline `data:image/...` strings are
 * replaced with compact, cacheable `/api/media/...` references in JSON API
 * payloads. Small synthetic strings in unit tests remain inline for backward
 * compatibility, while real uploaded avatars/banners (typically 15 KB–150 KB)
 * are converted to ~45-byte versioned URLs.
 */
export const INLINE_MEDIA_THRESHOLD = 1024;

const SAFE_DATA_IMAGE_RE =
  /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i;

export function computeMediaVersionHash(rawUrl: string): string {
  return createHash("sha1").update(rawUrl).digest("hex").slice(0, 12);
}

export function isOversizedDataImageUrl(
  rawUrl: string | null | undefined,
  threshold = INLINE_MEDIA_THRESHOLD
): rawUrl is string {
  return (
    typeof rawUrl === "string" &&
    rawUrl.length > threshold &&
    rawUrl.startsWith("data:image/")
  );
}

/**
 * Replaces an oversized inline `data:image/...` avatar or banner with a
 * compact, immutable, authenticated media endpoint URL.
 */
export function toCompactUserMediaUrl(
  userId: number | null | undefined,
  kind: "avatar" | "banner",
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl) return null;
  if (
    typeof userId === "number" &&
    Number.isFinite(userId) &&
    userId > 0 &&
    isOversizedDataImageUrl(rawUrl)
  ) {
    const version = computeMediaVersionHash(rawUrl);
    return `/api/media/user/${userId}/${kind}?v=${version}`;
  }
  return rawUrl;
}

/**
 * Replaces an oversized inline `data:image/...` conversation avatar with a
 * compact, immutable, authenticated media endpoint URL.
 */
export function toCompactConversationAvatarUrl(
  conversationId: number | null | undefined,
  rawUrl: string | null | undefined
): string | null {
  if (!rawUrl) return null;
  if (
    typeof conversationId === "number" &&
    Number.isFinite(conversationId) &&
    conversationId > 0 &&
    isOversizedDataImageUrl(rawUrl)
  ) {
    const version = computeMediaVersionHash(rawUrl);
    return `/api/media/conversation/${conversationId}/avatar?v=${version}`;
  }
  return rawUrl;
}

export interface ParsedImageDataUrl {
  contentType: string;
  buffer: Buffer;
  etag: string;
}

/**
 * Safely parses a `data:image/(png|jpeg|jpg|webp|gif);base64,...` string into
 * a binary Buffer and strong ETag. Rejects SVG or non-image MIME types to
 * prevent stored XSS via media endpoints.
 */
export function parseSafeImageDataUrl(
  rawUrl: string | null | undefined
): ParsedImageDataUrl | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const match = SAFE_DATA_IMAGE_RE.exec(rawUrl);
  if (!match) return null;
  const rawMime = match[1].toLowerCase();
  const contentType = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
  const base64Payload = match[2];
  try {
    const buffer = Buffer.from(base64Payload, "base64");
    if (buffer.byteLength === 0) return null;
    const etag = `"${computeMediaVersionHash(rawUrl)}"`;
    return { contentType, buffer, etag };
  } catch {
    return null;
  }
}

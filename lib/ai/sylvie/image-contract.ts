/** Shared bounds; file contents and storage credentials stay on the server. */
export const CHAT_IMAGE_LIMITS = { count: 4, bytes: 5 * 1024 * 1024, totalBytes: 12 * 1024 * 1024, maxSide: 4096 } as const;
export const CHAT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export interface ImageReference { messageId: number; index: number }
export interface ChatImage extends ImageReference { url: string; name: string; mimeType: string }
export interface ComposerImage { id: string; url: string; name: string; mimeType: string; file?: File; reference?: ImageReference }
export function imageSelectionError(files: readonly File[], existing = 0): string | null {
  if (files.length + existing > CHAT_IMAGE_LIMITS.count) return "Attach up to 4 images at a time.";
  if (files.some(file => !(CHAT_IMAGE_TYPES as readonly string[]).includes(file.type))) return "Choose a JPEG, PNG, WebP or GIF image.";
  if (files.some(file => !file.size || file.size > CHAT_IMAGE_LIMITS.bytes)) return "Each image must be between 1 byte and 5 MB.";
  if (files.reduce((sum, file) => sum + file.size, 0) > CHAT_IMAGE_LIMITS.totalBytes) return "Images must total 12 MB or less.";
  return null;
}

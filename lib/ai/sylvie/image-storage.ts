import "server-only";
import { randomUUID } from "crypto";
import { getStorageClient } from "@/lib/supabase-storage";
import type { PreparedImage } from "./images-server";
import { ChatImageError } from "./images-server";
import { CHAT_IMAGE_LIMITS, type ChatImage } from "./image-contract";

const BUCKET = "ai-chat-attachments", PREFIX = "sylf-images-v1:";
interface StoredImage { path: string; name: string; mimeType: string }
let privateBucket: Promise<void> | undefined;
async function bucket() {
  const client = await getStorageClient();
  if (!privateBucket) privateBucket = (async () => {
    // The migration provisions BOTH the private bucket and restrictive RLS.
    // Do not create a bucket here without its database access policy.
    const result = await client.storage.getBucket(BUCKET);
    if (result.error || !result.data || result.data.public) throw new ChatImageError("Private image storage is unavailable. Please try again later.", 503);
  })().catch(error => { privateBucket = undefined; throw error; });
  await privateBucket;
  return client.storage.from(BUCKET);
}
export function storedImages(value: string | null | undefined): StoredImage[] {
  if (!value?.startsWith(PREFIX) || value.length > 5000) return [];
  try {
    const images: unknown = JSON.parse(value.slice(PREFIX.length));
    if (!Array.isArray(images) || images.length > CHAT_IMAGE_LIMITS.count) return [];
    return images.filter((image): image is StoredImage => image && typeof image.path === "string" && /^\d+\/\d+\/[a-f0-9-]+\.(?:png|jpg|webp)$/.test(image.path) && typeof image.name === "string" && typeof image.mimeType === "string");
  } catch { return []; }
}
export const encodeStoredImages = (images: StoredImage[]) => PREFIX + JSON.stringify(images);
export function publicChatImages(message: { id: number; attachmentUrl?: string | null }): ChatImage[] {
  return storedImages(message.attachmentUrl).map((image, index) => ({ messageId: message.id, index, url: `/api/system-messages/${message.id}/images/${index}`, name: image.name, mimeType: image.mimeType }));
}
export function exposeChatImages<T extends { id: number; attachmentUrl?: string | null }>(message: T) {
  const attachments = publicChatImages(message);
  const legacy = message.attachmentUrl?.match(/^\/uploads\/(up_\d+_[a-f0-9]{12}\.(?:jpg|png|gif|webp))$/);
  return { ...message, attachmentUrl: attachments[0]?.url ?? (legacy ? `/api/system-messages/legacy-images/${legacy[1]}` : message.attachmentUrl?.startsWith(PREFIX) ? null : message.attachmentUrl), ...(attachments.length ? { attachments } : {}) };
}
export async function saveChatImages(userId: number, sessionId: number, images: PreparedImage[], signal: AbortSignal) {
  if (!images.length) return [];
  const storage = await bucket(), saved: StoredImage[] = [];
  try {
    for (const image of images) {
      signal.throwIfAborted();
      const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
      const path = `${userId}/${sessionId}/${randomUUID()}.${ext}`;
      const { error } = await storage.upload(path, image.buffer, { contentType: image.mimeType, cacheControl: "0", upsert: false });
      if (error) throw new ChatImageError("Image upload failed. Please try again.", 503);
      saved.push({ path, name: image.name, mimeType: image.mimeType });
    }
    signal.throwIfAborted();
    return saved;
  } catch (error) { await storage.remove(saved.map(image => image.path)).catch(() => {}); throw error; }
}
export async function removeChatImages(images: StoredImage[]) {
  if (images.length) {
    const { error } = await (await bucket()).remove(images.map(image => image.path));
    if (error) throw new ChatImageError("Private image cleanup is unavailable.", 503);
  }
}
function owned(image: StoredImage, userId: number, sessionId: number) {
  if (!image.path.startsWith(`${userId}/${sessionId}/`)) throw new ChatImageError("Image unavailable.", 404);
}
export async function readChatImage(image: StoredImage, userId: number, sessionId: number) {
  owned(image, userId, sessionId);
  const { data, error } = await (await bucket()).download(image.path);
  if (error || !data) throw new ChatImageError("Image unavailable.", 404);
  return { buffer: Buffer.from(await data.arrayBuffer()), mimeType: image.mimeType, name: image.name };
}
export async function signedChatImage(image: StoredImage, userId: number, sessionId: number) {
  owned(image, userId, sessionId);
  const { data, error } = await (await bucket()).createSignedUrl(image.path, 300);
  if (error || !data?.signedUrl) throw new ChatImageError("Image unavailable.", 503);
  return data.signedUrl;
}

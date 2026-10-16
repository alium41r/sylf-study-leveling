import "server-only";
import crypto from "crypto";
import { getStorageClient } from "@/lib/supabase-storage";

/**
 * A private bucket for planner intake uploads, mirroring the `focus-backgrounds-user`
 * pattern exactly: owner-scoped paths (`<userId>/<sessionId>/<random>.<ext>`), signed
 * delivery URLs only, and no public URL anywhere. The client filename is never a path
 * component, and every read/delete re-asserts ownership rather than trusting a caller.
 *
 * Logs use fixed operational labels; file paths, titles, signed URLs and raw errors stay out.
 */

export const PLANNER_INTAKE_BUCKET = "planner-intake";

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Session ids are server-issued tokens, but the path still re-validates before use. */
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,100}$/;

/** A listing is bounded so an intake-expiry sweep cannot page without end. */
const LIST_LIMIT = 100;

/** A server-generated, traversal-proof name; the client's filename is never consulted. */
function safeName(contentType: string): string {
  const ext = MIME_EXTENSION[contentType] ?? "bin";
  return `${crypto.randomBytes(16).toString("hex")}.${ext}`;
}

/** Strip a leading slash and an accidental bucket prefix, as the shared module does. */
function cleanPath(path: string): string {
  let clean = path.replace(/^\/+/, "");
  if (clean.startsWith(`${PLANNER_INTAKE_BUCKET}/`)) {
    clean = clean.slice(PLANNER_INTAKE_BUCKET.length + 1);
  }
  return clean;
}

/** Return the cleaned path only when it is owned by `userId`, else null. */
function ownedPath(userId: number, path: string): string | null {
  const clean = cleanPath(path);
  return clean.startsWith(`${userId}/`) ? clean : null;
}

export async function uploadIntakeFile(input: {
  userId: number;
  sessionId: string;
  filename: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ path: string } | { error: string }> {
  const { userId, sessionId, buffer, contentType } = input;
  // `filename` is accepted for the caller's own bookkeeping and never read here: a
  // client-supplied name is not a path component, so nothing about it can traverse.
  if (!userId || userId <= 0) return { error: "Invalid userId" };
  if (!SESSION_ID_RE.test(sessionId)) return { error: "Invalid session id" };

  try {
    const client = await getStorageClient();
    const path = `${userId}/${sessionId}/${safeName(contentType)}`;
    const { error } = await client.storage.from(PLANNER_INTAKE_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: "3600", // private, short-lived browser cache
      upsert: false,
    });
    if (error) {
      console.warn("[planner-import] upload unavailable");
      return { error: error.message };
    }
    return { path };
  } catch (err: any) {
    console.warn("[planner-import] Upload error:");
    return { error: err?.message || String(err) };
  }
}

export async function getIntakeFileSignedUrl(
  userId: number,
  path: string,
  expiresInSeconds = 900
): Promise<{ signedUrl: string | null; error?: string }> {
  const owned = ownedPath(userId, path);
  if (!owned) {
    console.warn("[planner-import] access denied");
    return { signedUrl: null, error: "Access denied" };
  }

  try {
    const client = await getStorageClient();
    const { data, error } = await client.storage
      .from(PLANNER_INTAKE_BUCKET)
      .createSignedUrl(owned, expiresInSeconds);
    if (error || !data?.signedUrl) {
      console.warn("[planner-import] signing unavailable");
      return { signedUrl: null, error: error?.message || "Failed to generate signed URL" };
    }
    return { signedUrl: data.signedUrl };
  } catch (err: any) {
    console.warn("[planner-import] Signed URL error:");
    return { signedUrl: null, error: err?.message || String(err) };
  }
}

export async function deleteIntakeFile(
  userId: number,
  path: string
): Promise<{ ok: boolean; error?: string }> {
  const owned = ownedPath(userId, path);
  if (!owned) return { ok: false, error: "Access denied" };

  try {
    const client = await getStorageClient();
    const { error } = await client.storage.from(PLANNER_INTAKE_BUCKET).remove([owned]);
    if (error) {
      console.warn("[planner-import] deletion unavailable");
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    console.warn("[planner-import] Delete error:");
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function deleteIntakeFiles(
  userId: number,
  paths: readonly string[]
): Promise<{ ok: boolean; deletedCount: number; errors: string[] }> {
  // Paths the user does not own are simply not deleted — the ownership check is the
  // point, and a refused path is not an error to retry.
  const owned = paths
    .map((path) => ownedPath(userId, path))
    .filter((path): path is string => path !== null);
  if (owned.length === 0) return { ok: true, deletedCount: 0, errors: [] };

  try {
    const client = await getStorageClient();
    const { error } = await client.storage.from(PLANNER_INTAKE_BUCKET).remove(owned);
    if (error) return { ok: false, deletedCount: 0, errors: [error.message] };
    return { ok: true, deletedCount: owned.length, errors: [] };
  } catch (err: any) {
    return { ok: false, deletedCount: 0, errors: [err?.message || String(err)] };
  }
}

export async function deleteSessionFiles(
  userId: number,
  sessionId: string
): Promise<{ ok: boolean; deletedCount: number; error?: string }> {
  if (!SESSION_ID_RE.test(sessionId)) {
    return { ok: false, deletedCount: 0, error: "Invalid session id" };
  }
  const prefix = `${userId}/${sessionId}/`;

  try {
    const client = await getStorageClient();
    const { data, error } = await client.storage
      .from(PLANNER_INTAKE_BUCKET)
      .list(prefix, { limit: LIST_LIMIT, sortBy: { column: "name", order: "asc" } });
    if (error) {
      console.warn("[planner-import] listing unavailable");
      return { ok: false, deletedCount: 0, error: error.message };
    }

    // The list prefix scopes the listing, and each returned name is re-checked so a
    // malformed listing can never push a delete outside `<userId>/<sessionId>/`.
    const names = (data ?? [])
      .map((file) => file.name)
      .filter((name): name is string => !!name && name.startsWith(prefix));
    if (names.length === 0) return { ok: true, deletedCount: 0 };

    const { error: removeError } = await client.storage
      .from(PLANNER_INTAKE_BUCKET)
      .remove(names);
    if (removeError) return { ok: false, deletedCount: 0, error: removeError.message };
    return { ok: true, deletedCount: names.length };
  } catch (err: any) {
    console.warn("[planner-import] Session delete error:");
    return { ok: false, deletedCount: 0, error: err?.message || String(err) };
  }
}

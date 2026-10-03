// ============================================================================
// Supabase Storage Service (Server-Only)
// ============================================================================
// Manages the 'focus-backgrounds' official bucket.
// Object path structure within bucket: <category-slug>/<safe-name>.<ext>
// (never duplicates the bucket name in the object path).
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import crypto from "crypto";

export const FOCUS_BACKGROUNDS_BUCKET = "focus-backgrounds";

const MIME_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

let cachedClient: SupabaseClient | null = null;

/** For unit testing: inject a mock client or reset to null */
export function setStorageClientForTesting(client: any | null) {
  cachedClient = client;
}

/**
 * Creates an authorized server-side Supabase client.
 * Strictly server-only: never exposes service-role keys to browser.
 */
export async function getStorageClient(): Promise<SupabaseClient> {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  // Check if explicit service role key is provided in environment
  let token = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fallback: mint a service_role JWT using the Supabase JWT secret
  if (!token) {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (!jwtSecret) {
      throw new Error(
        "Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_JWT_SECRET is configured. Storage management is unavailable."
      );
    }
    const secret = new TextEncoder().encode(jwtSecret);
    token = await new SignJWT({
      role: "service_role",
      iss: "supabase",
      sub: "service_role",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);
  }

  cachedClient = createClient(url, token, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

/**
 * Returns the public CDN URL for a given background storage path.
 * Format: https://<project>.supabase.co/storage/v1/object/public/focus-backgrounds/<category-slug>/<filename>
 */
export function getBackgroundPublicUrl(storagePath: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "";
  // Strip any leading slashes or accidental bucket prefixes
  let cleanPath = storagePath.replace(/^\/+/, "");
  if (cleanPath.startsWith(`${FOCUS_BACKGROUNDS_BUCKET}/`)) {
    cleanPath = cleanPath.substring(`${FOCUS_BACKGROUNDS_BUCKET}/`.length);
  }
  return `${url}/storage/v1/object/public/${FOCUS_BACKGROUNDS_BUCKET}/${cleanPath}`;
}

/**
 * Uploads an image buffer to the 'focus-backgrounds' bucket.
 * Target path: <categorySlug>/<safe-name>.<ext>
 */
export async function uploadBackgroundFile(
  categorySlug: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const client = await getStorageClient();
  const ext = MIME_EXTENSION[mimeType] ?? "jpg";
  const cleanCategory = categorySlug.toLowerCase().replace(/[^a-z0-9-_]/g, "");
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const filename = `bg_${Date.now()}_${randomSuffix}.${ext}`;

  // Preferred path: <category-slug>/<filename>
  const storagePath = `${cleanCategory}/${filename}`;

  const { error } = await client.storage
    .from(FOCUS_BACKGROUNDS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      cacheControl: "31536000, immutable", // 1 year cache
      upsert: false,
    });

  if (error) {
    console.error("[supabase-storage] Upload failed:", error);
    throw new Error(`Failed to upload to storage: ${error.message}`);
  }

  const publicUrl = getBackgroundPublicUrl(storagePath);
  return { storagePath, publicUrl };
}

/**
 * Removes an object from the 'focus-backgrounds' bucket.
 */
export async function deleteBackgroundFile(
  storagePath: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = await getStorageClient();
    let cleanPath = storagePath.replace(/^\/+/, "");
    if (cleanPath.startsWith(`${FOCUS_BACKGROUNDS_BUCKET}/`)) {
      cleanPath = cleanPath.substring(`${FOCUS_BACKGROUNDS_BUCKET}/`.length);
    }

    const { error } = await client.storage
      .from(FOCUS_BACKGROUNDS_BUCKET)
      .remove([cleanPath]);

    if (error) {
      console.warn(`[supabase-storage] Delete warning for "${cleanPath}":`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err: any) {
    console.error("[supabase-storage] Delete error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Deletes multiple background files from the storage bucket.
 * Useful when cascading a category deletion.
 */
export async function deleteMultipleBackgroundFiles(
  storagePaths: string[]
): Promise<{ ok: boolean; deletedCount: number; errors: string[] }> {
  if (!storagePaths.length) return { ok: true, deletedCount: 0, errors: [] };

  const client = await getStorageClient();
  const cleanPaths = storagePaths.map((p) => {
    let clean = p.replace(/^\/+/, "");
    if (clean.startsWith(`${FOCUS_BACKGROUNDS_BUCKET}/`)) {
      clean = clean.substring(`${FOCUS_BACKGROUNDS_BUCKET}/`.length);
    }
    return clean;
  });

  const { error } = await client.storage
    .from(FOCUS_BACKGROUNDS_BUCKET)
    .remove(cleanPaths);

  if (error) {
    console.warn("[supabase-storage] Batch delete warning:", error.message);
    return { ok: false, deletedCount: 0, errors: [error.message] };
  }

  return { ok: true, deletedCount: cleanPaths.length, errors: [] };
}

// ─── User Personal Focus Backgrounds (Phase 5A) ───────────────────────────────

export const USER_FOCUS_BACKGROUNDS_BUCKET = "focus-backgrounds-user";

/**
 * Uploads a validated user personal background to the private storage bucket.
 * Target path structure: <userId>/usr_<timestamp>_<random>.<ext>
 * Never trusts or incorporates client-provided filenames.
 */
export async function uploadUserBackgroundFile(
  userId: number,
  buffer: Buffer,
  mimeType: string
): Promise<{ storagePath: string }> {
  if (!userId || userId <= 0) {
    throw new Error("Invalid userId for user background upload");
  }

  const client = await getStorageClient();
  const ext = MIME_EXTENSION[mimeType] ?? "jpg";
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const filename = `usr_${Date.now()}_${randomSuffix}.${ext}`;

  // Enforce server-constructed path: <userId>/<safe-filename>
  const storagePath = `${userId}/${filename}`;

  const { error } = await client.storage
    .from(USER_FOCUS_BACKGROUNDS_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      cacheControl: "3600", // private short-term browser cache
      upsert: false,
    });

  if (error) {
    console.error("[supabase-storage] User background upload failed:", error);
    throw new Error(`Failed to upload personal background: ${error.message}`);
  }

  return { storagePath };
}

/**
 * Generates an ephemeral signed delivery URL for a personal background.
 * Defense in depth: Validates that the storagePath begins with `<userId>/`.
 * Never accepts arbitrary paths from client without ownership binding.
 */
export async function getUserBackgroundSignedUrl(
  userId: number,
  storagePath: string,
  expiresInSeconds: number = 3600
): Promise<{ signedUrl: string | null; error?: string }> {
  try {
    let cleanPath = storagePath.replace(/^\/+/, "");
    if (cleanPath.startsWith(`${USER_FOCUS_BACKGROUNDS_BUCKET}/`)) {
      cleanPath = cleanPath.substring(`${USER_FOCUS_BACKGROUNDS_BUCKET}/`.length);
    }

    // Path prefix validation: must belong to the requested user
    const expectedPrefix = `${userId}/`;
    if (!cleanPath.startsWith(expectedPrefix)) {
      console.error(
        `[supabase-storage] Security: Path traversal or cross-user access rejected. Expected prefix '${expectedPrefix}', got '${cleanPath}'`
      );
      return { signedUrl: null, error: "Access denied: invalid storage path ownership" };
    }

    const client = await getStorageClient();
    const { data, error } = await client.storage
      .from(USER_FOCUS_BACKGROUNDS_BUCKET)
      .createSignedUrl(cleanPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      console.warn(`[supabase-storage] Signed URL generation failed for '${cleanPath}':`, error?.message);
      return { signedUrl: null, error: error?.message || "Failed to generate signed URL" };
    }

    return { signedUrl: data.signedUrl };
  } catch (err: any) {
    console.error("[supabase-storage] Signed URL error:", err);
    return { signedUrl: null, error: err?.message || String(err) };
  }
}

/**
 * Deletes an object from the private 'focus-backgrounds-user' bucket.
 * Defense in depth: Validates that the storagePath strictly starts with `<userId>/`.
 */
export async function deleteUserBackgroundFile(
  userId: number,
  storagePath: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    let cleanPath = storagePath.replace(/^\/+/, "");
    if (cleanPath.startsWith(`${USER_FOCUS_BACKGROUNDS_BUCKET}/`)) {
      cleanPath = cleanPath.substring(`${USER_FOCUS_BACKGROUNDS_BUCKET}/`.length);
    }

    // Defense in depth: verify user directory prefix
    const expectedPrefix = `${userId}/`;
    if (!cleanPath.startsWith(expectedPrefix)) {
      console.error(
        `[supabase-storage] Security: Cross-user delete rejected. Expected '${expectedPrefix}', got '${cleanPath}'`
      );
      return { ok: false, error: "Access denied: invalid storage path ownership" };
    }

    const client = await getStorageClient();
    const { error } = await client.storage
      .from(USER_FOCUS_BACKGROUNDS_BUCKET)
      .remove([cleanPath]);

    if (error) {
      console.warn(`[supabase-storage] User file delete warning for "${cleanPath}":`, error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err: any) {
    console.error("[supabase-storage] User file delete error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}


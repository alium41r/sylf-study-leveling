/**
 * CustomAudioStore — Local-Only Audio Library Storage Abstraction
 *
 * IndexedDB-backed storage for user-imported audio files.
 * Binary audio data is stored in IndexedDB (never localStorage).
 *
 * Contract:
 *   import / list / get / getPlaybackUrl / rename / remove / clear / status
 *
 * Platform note:
 *   This is the Web implementation. The interface (CustomAudioStoreContract)
 *   is designed so a Capacitor/Android-native adapter can replace it later.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface CustomAudioEntry {
  /** Unique identifier (crypto.randomUUID) */
  id: string;
  /** Display title (default: filename without extension) */
  title: string;
  /** Original filename as chosen by the user */
  originalFilename: string;
  /** MIME type from the File object */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Audio duration in seconds (0 if unknown) */
  duration: number;
  /** ISO 8601 date string */
  dateAdded: string;
}

/** Metadata-only (no blob). Used for lightweight library listing. */
export type CustomAudioMeta = Omit<CustomAudioEntry, never>;

export interface ImportResult {
  success: boolean;
  entry?: CustomAudioEntry;
  error?: string;
}

export interface StoreStatus {
  ready: boolean;
  entryCount: number;
  estimatedBytes: number;
  error?: string;
}

// ─── Supported formats ──────────────────────────────────────────

/**
 * Conservative allowlist based on reliable cross-browser + Android WebView support.
 *
 * MP3: Universal
 * AAC/M4A: Safari, Chrome, Edge, Firefox 22+
 * WAV: Universal
 * OGG Vorbis: Chrome, Firefox, Edge (not Safari ≤16)
 * WebM audio: Chrome, Firefox, Edge
 */
export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",        // .mp3
  "audio/mp3",         // alias
  "audio/mp4",         // .m4a / .mp4 audio
  "audio/x-m4a",       // .m4a alias
  "audio/aac",         // raw .aac
  "audio/wav",         // .wav
  "audio/x-wav",       // .wav alias
  "audio/wave",        // .wav alias
  "audio/ogg",         // .ogg
  "audio/webm",        // .webm audio
]);

export const SUPPORTED_EXTENSIONS = new Set([
  ".mp3", ".m4a", ".aac", ".wav", ".ogg", ".webm",
]);

/** Maximum single-file import size: 100 MB */
export const MAX_IMPORT_SIZE_BYTES = 100 * 1024 * 1024;

// ─── IndexedDB constants ────────────────────────────────────────

const DB_NAME = "sylf_custom_audio";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_BLOBS = "blobs";

// ─── Helpers ────────────────────────────────────────────────────

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const name = dot >= 0 ? filename.slice(0, dot) : filename;
  return name.trim() || "Untitled";
}

// ─── Database lifecycle ─────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTransaction(
  tx: IDBTransaction
): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

// ─── Object URL tracking ────────────────────────────────────────

const activeObjectUrls = new Map<string, string>();

function revokeObjectUrl(id: string): void {
  const url = activeObjectUrls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    activeObjectUrls.delete(id);
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Validate that a File is a supported audio format.
 * Returns null if valid, or an error message string.
 */
export function validateAudioFile(file: File): string | null {
  if (file.size === 0) {
    return "File is empty.";
  }
  if (file.size > MAX_IMPORT_SIZE_BYTES) {
    return `File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 100MB.`;
  }

  const ext = getExtension(file.name);
  const mimeOk = SUPPORTED_AUDIO_MIME_TYPES.has(file.type);
  const extOk = SUPPORTED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) {
    return `Unsupported audio format. Supported: MP3, M4A, AAC, WAV, OGG, WebM.`;
  }

  return null;
}

/**
 * Attempt to decode an ArrayBuffer to verify it's actually playable audio.
 * Returns the duration in seconds, or throws on decode failure.
 */
export async function probeAudioDuration(arrayBuffer: ArrayBuffer): Promise<number> {
  // Use an offline AudioContext to decode and verify
  const win = typeof window !== "undefined" ? (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }) : undefined;
  const AudioCtx = win?.AudioContext || win?.webkitAudioContext;
  if (!AudioCtx) {
    return 0; // can't probe, return unknown
  }

  const ctx = new AudioCtx();
  try {
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return buffer.duration;
  } finally {
    ctx.close().catch(() => {});
  }
}

/**
 * Import a user-selected File into the local library.
 * Validates format, probes duration, persists to IndexedDB.
 */
export async function importAudio(file: File): Promise<ImportResult> {
  // 1. Validate
  const validationError = validateAudioFile(file);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // 2. Read file bytes
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return { success: false, error: "Failed to read the audio file." };
  }

  // 3. Probe actual decode-ability and get duration
  let duration = 0;
  try {
    duration = await probeAudioDuration(arrayBuffer);
  } catch {
    return {
      success: false,
      error: "This file could not be decoded as audio. It may be corrupt or in an unsupported codec.",
    };
  }

  // 4. Build metadata entry
  const entry: CustomAudioEntry = {
    id: crypto.randomUUID(),
    title: titleFromFilename(file.name),
    originalFilename: file.name,
    mimeType: file.type || "audio/mpeg",
    sizeBytes: arrayBuffer.byteLength,
    duration,
    dateAdded: new Date().toISOString(),
  };

  // 5. Persist to IndexedDB
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_META, STORE_BLOBS], "readwrite");
    tx.objectStore(STORE_META).put(entry);
    tx.objectStore(STORE_BLOBS).put(arrayBuffer, entry.id);
    await idbTransaction(tx);
  } catch (e: unknown) {
    const err = e as { name?: string; code?: number; message?: string } | null;
    // Handle quota exceeded
    if (err?.name === "QuotaExceededError" || err?.code === 22) {
      return {
        success: false,
        error: "Not enough storage space. Try removing some audio files first.",
      };
    }
    return {
      success: false,
      error: `Storage error: ${err?.message || "Unknown error"}`,
    };
  }

  return { success: true, entry };
}

/**
 * List all imported audio entries (metadata only, no blobs).
 * Sorted by dateAdded descending (newest first).
 */
export async function listAudio(): Promise<CustomAudioEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, "readonly");
    const entries = await idbRequest<CustomAudioEntry[]>(
      tx.objectStore(STORE_META).getAll()
    );
    // Sort newest first
    entries.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    return entries;
  } catch {
    return [];
  }
}

/**
 * Get a single entry's metadata.
 */
export async function getAudioMeta(id: string): Promise<CustomAudioEntry | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, "readonly");
    const entry = await idbRequest<CustomAudioEntry | undefined>(
      tx.objectStore(STORE_META).get(id)
    );
    return entry ?? null;
  } catch {
    return null;
  }
}

/**
 * Create and return an Object URL for playback.
 * Revokes any previous Object URL for the same id.
 * Caller must eventually call revokePlaybackUrl(id) or removeAudio(id).
 */
export async function getPlaybackUrl(id: string): Promise<string | null> {
  // Revoke old URL for this id if any
  revokeObjectUrl(id);

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const arrayBuffer = await idbRequest<ArrayBuffer | undefined>(
      tx.objectStore(STORE_BLOBS).get(id)
    );

    if (!arrayBuffer) return null;

    // Get mime type from meta
    const meta = await getAudioMeta(id);
    const mimeType = meta?.mimeType || "audio/mpeg";

    const blob = new Blob([arrayBuffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    activeObjectUrls.set(id, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Revoke a playback Object URL without removing the entry.
 */
export function revokePlaybackUrl(id: string): void {
  revokeObjectUrl(id);
}

/**
 * Rename an entry's display title.
 */
export async function renameAudio(id: string, newTitle: string): Promise<boolean> {
  const trimmed = newTitle.trim();
  if (!trimmed) return false;

  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, "readwrite");
    const store = tx.objectStore(STORE_META);
    const entry = await idbRequest<CustomAudioEntry | undefined>(store.get(id));
    if (!entry) return false;

    entry.title = trimmed;
    store.put(entry);
    await idbTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove an entry and its blob from IndexedDB.
 * Also revokes any active Object URL.
 */
export async function removeAudio(id: string): Promise<boolean> {
  revokeObjectUrl(id);

  try {
    const db = await openDB();
    const tx = db.transaction([STORE_META, STORE_BLOBS], "readwrite");
    tx.objectStore(STORE_META).delete(id);
    tx.objectStore(STORE_BLOBS).delete(id);
    await idbTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove all entries and blobs.
 */
export async function clearAllAudio(): Promise<boolean> {
  // Revoke all active object URLs
  for (const [id] of activeObjectUrls) {
    revokeObjectUrl(id);
  }

  try {
    const db = await openDB();
    const tx = db.transaction([STORE_META, STORE_BLOBS], "readwrite");
    tx.objectStore(STORE_META).clear();
    tx.objectStore(STORE_BLOBS).clear();
    await idbTransaction(tx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage status (entry count and estimated size).
 */
export async function getStoreStatus(): Promise<StoreStatus> {
  try {
    const entries = await listAudio();
    const estimatedBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0);
    return {
      ready: true,
      entryCount: entries.length,
      estimatedBytes,
    };
  } catch (e: unknown) {
    const err = e as { message?: string } | null;
    return {
      ready: false,
      entryCount: 0,
      estimatedBytes: 0,
      error: err?.message || "Storage unavailable",
    };
  }
}

/**
 * Revoke all active object URLs. Call on unmount / cleanup.
 */
export function revokeAllPlaybackUrls(): void {
  for (const [id] of activeObjectUrls) {
    revokeObjectUrl(id);
  }
}

/** For testing: reset the DB promise so a fresh DB can be opened */
export function _resetDBForTesting(): void {
  dbPromise = null;
  revokeAllPlaybackUrls();
}

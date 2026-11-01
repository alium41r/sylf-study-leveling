import { z } from "zod";
import { apiFetch } from "@/lib/api-transport";
import { digest } from "./bytes";
import { decodePack, encodePack, PACK_BYTES, PACK_HEADER_BYTES } from "./pack";
import { hashSchema, type PreparedObject } from "./contracts";
import { NotesError } from "./errors";
import { TransportError, type NotesTransport } from "./sync";
import { invalidateNotesAccess, type NotesSession } from "./session";

const fileSchema = z.object({
  id: z.string().regex(/^[\w-]{1,200}$/),
  hash: hashSchema,
  version: z.string().min(1).max(64),
});
type File = z.infer<typeof fileSchema>;
type DecodedPack = Awaited<ReturnType<typeof decodePack>>;
// Small delta packs must survive an entire cold dependency walk. Bound bytes
// rather than evicting after four tiny files (and downloading them repeatedly).
const PACK_CACHE_BYTES = 16 * 1024 * 1024;
const PACK_CACHE_FILES = 128;
export async function notesRequest(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await apiFetch(path, {
      ...init,
      credentials: "include",
      cache: "no-store",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(55000)])
        : AbortSignal.timeout(55000),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new TransportError("NETWORK");
  }
  if (!response.ok) {
    // Broker 401 means Sylf authentication ended; Drive consent failures use 409.
    // Fence loaded keys immediately rather than waiting for a profile refresh.
    if (response.status === 401) {
      invalidateNotesAccess();
      throw new NotesError(
        "SESSION_ENDED",
        "Sign in to Sylf again to reopen Notes. Your local notes are retained."
      );
    }
    const error = await response.json().catch(() => ({}));
    if (response.status === 403 && error.code === "ORIGIN")
      throw new Error(
        "Open Notes at your permanent Sylf address to connect Google Drive. Your local notes are kept."
      );
    const code = [
      "AUTH",
      "QUOTA",
      "THROTTLE",
      "CURSOR_EXPIRED",
      "NETWORK",
    ].includes(error.code)
      ? error.code
      : response.status === 401
        ? "AUTH"
        : "NETWORK";
    if (["CORRUPT", "OWNERSHIP", "UNSUPPORTED", "LIMIT"].includes(error.code))
      throw new NotesError(
        error.code,
        error.error || "Cloud integrity verification failed."
      );
    throw new TransportError(
      code,
      Math.max(0, Number(response.headers.get("retry-after") || 0)) * 1000
    );
  }
  return response;
}
export class GoogleDriveTransport implements NotesTransport {
  private files: File[] = [];
  private scanId?: string;
  private pendingPage?: { cursor: string; files: File[] };
  listingVersion = 0;
  private listingInitialized = false;
  private readonly locations = new Map<string, string>();
  private readonly indexed = new Map<string, string>();
  private readonly delivered = new Map<string, string>();
  private readonly cache = new Map<
    string,
    { pack: DecodedPack; bytes: number }
  >();
  private cacheBytes = 0;
  private readonly loading = new Map<string, Promise<DecodedPack>>();
  constructor(
    readonly scope: NotesTransport["scope"],
    private readonly session: NotesSession,
    private readonly readLocal?: (hash: string) => Promise<Uint8Array>
  ) {
    session.onClose(() => {
      this.files = [];
      this.locations.clear();
      this.indexed.clear();
      this.delivered.clear();
      this.pendingPage = undefined;
      this.cache.clear();
      this.cacheBytes = 0;
      this.loading.clear();
    });
  }
  private async request(input: unknown, signal: AbortSignal) {
    this.session.assert();
    const response = await notesRequest("/api/notes/drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    this.session.assert();
    return response;
  }
  duplicatePackHashes() {
    this.session.assert();
    const seen = new Set<string>(),
      duplicates = new Set<string>();
    for (const file of this.files) {
      if (seen.has(file.hash)) duplicates.add(file.hash);
      seen.add(file.hash);
    }
    return [...duplicates].slice(0, 4);
  }
  async refresh(signal = this.session.signal) {
    const files: File[] = [],
      seen = new Set<string>(),
      fileIds = new Map<string, File>();
    let cursor: string | undefined;
    do {
      const page = z
        .object({
          files: z.array(fileSchema).max(100),
          cursor: z.string().optional(),
        })
        .parse(
          await (
            await this.request(
              { action: "list", ...(cursor ? { cursor } : {}) },
              signal
            )
          ).json()
        );
      this.session.assert();
      for (const file of page.files) {
        const prior = fileIds.get(file.id);
        if (
          prior &&
          (prior.hash !== file.hash || prior.version !== file.version)
        )
          throw new TransportError("CURSOR_EXPIRED");
        if (!prior) {
          fileIds.set(file.id, file);
          files.push(file);
        }
      }
      cursor = page.cursor;
      if (files.length > 25000 || (cursor && seen.has(cursor)))
        throw new NotesError(
          "LIMIT",
          "Drive library scan exceeds its safe limit."
        );
      if (cursor) seen.add(cursor);
    } while (cursor);
    const current = new Map(files.map((f) => [f.id, f]));
    for (const [id, version] of this.indexed)
      if (!current.has(id) || current.get(id)!.version !== version) {
        this.indexed.delete(id);
        this.evict(id);
        for (const [hash, location] of this.locations)
          if (location === id) this.locations.delete(hash);
      }
    // New packs are verified during adoption/upload. Re-audit historical copies
    // only on cold start or loss/change of a previously observed physical file.
    if (
      !this.listingInitialized ||
      this.files.some((old) => {
        const next = current.get(old.id);
        return !next || next.hash !== old.hash || next.version !== old.version;
      })
    )
      this.listingVersion++;
    this.listingInitialized = true;
    this.files = files;
  }
  private evict(id: string) {
    const cached = this.cache.get(id);
    if (cached) this.cacheBytes -= cached.bytes;
    this.cache.delete(id);
  }
  private load(
    file: File,
    signal: AbortSignal,
    allowReplacement = true
  ): Promise<DecodedPack> {
    this.session.assert();
    const key = `${file.id}:${file.version}`;
    const existing = this.loading.get(key);
    if (existing) return existing;
    const task = this.download(file, signal, allowReplacement).finally(() => {
      if (this.loading.get(key) === task) this.loading.delete(key);
    });
    this.loading.set(key, task);
    return task;
  }
  private async download(
    file: File,
    signal: AbortSignal,
    allowReplacement = true
  ): Promise<DecodedPack> {
    this.session.assert();
    const cached = this.cache.get(file.id);
    if (cached && this.indexed.get(file.id) === file.version) {
      this.cache.delete(file.id);
      this.cache.set(file.id, cached);
      return cached.pack;
    }
    if (cached) this.evict(file.id);
    let response: Response;
    try {
      response = await this.request(
        { action: "read", fileId: file.id },
        signal
      );
    } catch (error) {
      // Another tab may have retired an identical physical duplicate since our
      // scan. Retry only an exact pack hash; a missing unique pack still fails.
      if (
        allowReplacement &&
        error instanceof NotesError &&
        ["CORRUPT", "OWNERSHIP"].includes(error.code)
      ) {
        await this.refresh(signal);
        const replacement = this.files.find(
          (f) => f.id !== file.id && f.hash === file.hash
        );
        if (replacement) return this.load(replacement, signal, false);
      }
      throw error;
    }
    if (Number(response.headers.get("content-length") || 0) > PACK_BYTES)
      throw new NotesError("LIMIT", "Cloud transfer exceeds its safe limit.");
    const reader = response.body!.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > PACK_BYTES)
          throw new NotesError(
            "LIMIT",
            "Cloud transfer exceeds its safe limit."
          );
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if ((await digest(bytes)) !== file.hash)
      throw new NotesError("CORRUPT", "Drive batch checksum failed.");
    const pack = await decodePack(bytes, this.scope.libraryId);
    this.session.assert();
    this.indexed.set(file.id, file.version);
    for (const hash of pack.objects.keys()) this.locations.set(hash, file.id);
    this.evict(file.id);
    this.cache.set(file.id, { pack, bytes: size });
    this.cacheBytes += size;
    while (
      this.cacheBytes > PACK_CACHE_BYTES ||
      this.cache.size > PACK_CACHE_FILES
    )
      this.evict(this.cache.keys().next().value!);
    return pack;
  }
  async candidates(hash: string, signal: AbortSignal): Promise<Uint8Array[]> {
    this.session.assert();
    hashSchema.parse(hash);
    const location = this.locations.get(hash),
      known = this.files.find((f) => f.id === location);
    if (known) {
      // This exact physical version was downloaded and fully hash-verified in
      // this unlocked session. Reuse matching durable bytes instead of fetching
      // its entire pack for each historical dependency after cache eviction.
      if (this.readLocal && this.indexed.get(known.id) === known.version) {
        try {
          const bytes = await this.readLocal(hash);
          this.session.assert();
          if ((await digest(bytes)) !== hash)
            throw new NotesError("CORRUPT", "Local object checksum failed.");
          return [bytes];
        } catch (error) {
          if (!(error instanceof NotesError) || error.code !== "NOT_FOUND")
            throw error;
        }
      }
      const bytes = (await this.load(known, signal)).objects.get(hash);
      if (bytes) return [bytes.slice()];
    }
    const unindexed = this.files.filter((file) => !this.indexed.has(file.id));
    for (let offset = 0; offset < unindexed.length; offset += 4) {
      const packs = await Promise.all(
        unindexed
          .slice(offset, offset + 4)
          .map((file) => this.load(file, signal))
      );
      for (const pack of packs) {
        const bytes = pack.objects.get(hash);
        if (bytes) return [bytes.slice()];
      }
    }
    return [];
  }
  async create(hash: string, bytes: Uint8Array, signal: AbortSignal) {
    await this.createMany([{ hash, bytes }], [], signal);
  }
  async createMany(
    objects: PreparedObject[],
    revisions: string[],
    signal: AbortSignal
  ) {
    let group: PreparedObject[] = [],
      size = 0;
    const flush = async () => {
      if (!group.length) return;
      const hashes = new Set(group.map((o) => o.hash));
      const bytes = await encodePack(
          this.scope.libraryId,
          group,
          revisions.filter((id) => hashes.has(id))
        ),
        hash = await digest(bytes);
      this.session.assert();
      try {
        const response = await notesRequest(
          `/api/notes/drive?action=upload&hash=${hash}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: bytes.slice().buffer,
            signal,
          }
        );
        const file = fileSchema.parse((await response.json()).file);
        this.session.assert();
        this.files.push(file);
        await this.load(file, signal);
        this.delivered.set(file.id, file.version);
      } catch (error) {
        await this.refresh(signal);
        for (const object of group)
          if (!(await this.candidates(object.hash, signal)).length) throw error;
      }
      group = [];
      size = 0;
    };
    for (const object of objects) {
      if (
        group.length >= 500 ||
        size + object.bytes.length > PACK_BYTES - PACK_HEADER_BYTES - 12
      )
        await flush();
      group.push(object);
      size += object.bytes.length;
    }
    await flush();
  }
  async enumerate(cursor: string | undefined, signal: AbortSignal) {
    this.session.assert();
    let offset = 0;
    if (!cursor || cursor === "done") {
      await this.refresh(signal);
      this.scanId = crypto.randomUUID();
    } else {
      const match = /^scan:([\w-]+):(\d+)$/.exec(cursor);
      // A persisted cursor cannot resume a volatile listing in another tab/process.
      // Rescan instead; immutable adoption makes replay safe.
      if (!match || !this.scanId || match[1] !== this.scanId)
        throw new TransportError("CURSOR_EXPIRED");
      offset = Number(match[2]);
    }
    const slice = this.files.slice(offset, offset + 2),
      revisions = new Set<string>();
    await Promise.all(
      slice.map(async (file) => {
        if (this.delivered.get(file.id) === file.version) return;
        const pack = await this.load(file, signal);
        for (const id of pack.revisions) revisions.add(id);
      })
    );
    const more = offset + slice.length < this.files.length;
    const nextCursor = more
      ? `scan:${this.scanId}:${offset + slice.length}`
      : "done";
    this.pendingPage = { cursor: nextCursor, files: slice };
    return {
      revisionIds: [...revisions],
      cursor: nextCursor,
      more,
    };
  }
  acknowledgePage(cursor: string) {
    this.session.assert();
    if (this.pendingPage?.cursor !== cursor)
      throw new TransportError("CURSOR_EXPIRED");
    for (const file of this.pendingPage.files)
      this.delivered.set(file.id, file.version);
    this.pendingPage = undefined;
  }
}

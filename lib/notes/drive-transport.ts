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
export async function notesRequest(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    signal: init.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(55000)])
      : AbortSignal.timeout(55000),
  });
  if (!response.ok) {
    // Broker 401 means Sylf authentication ended; Drive consent failures use 409.
    // Fence loaded keys immediately rather than waiting for a profile refresh.
    if (response.status === 401) {
      invalidateNotesAccess();
      throw new TransportError("AUTH");
    }
    const error = await response.json().catch(() => ({}));
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
    if (error.code === "CORRUPT")
      throw new NotesError(
        "CORRUPT",
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
    Awaited<ReturnType<typeof decodePack>>
  >();
  constructor(
    readonly scope: NotesTransport["scope"],
    private readonly session: NotesSession
  ) {
    session.onClose(() => {
      this.files = [];
      this.locations.clear();
      this.indexed.clear();
      this.delivered.clear();
      this.pendingPage = undefined;
      this.cache.clear();
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
        this.cache.delete(id);
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
  private async load(file: File, signal: AbortSignal) {
    this.session.assert();
    const cached = this.cache.get(file.id);
    if (cached && this.indexed.get(file.id) === file.version) return cached;
    if (cached) this.cache.delete(file.id);
    const response = await this.request(
      { action: "read", fileId: file.id },
      signal
    );
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
    this.cache.set(file.id, pack);
    while (this.cache.size > 4)
      this.cache.delete(this.cache.keys().next().value!);
    return pack;
  }
  async candidates(hash: string, signal: AbortSignal): Promise<Uint8Array[]> {
    this.session.assert();
    hashSchema.parse(hash);
    const location = this.locations.get(hash),
      known = this.files.find((f) => f.id === location);
    if (known) {
      const bytes = (await this.load(known, signal)).objects.get(hash);
      if (bytes) return [bytes.slice()];
    }
    for (const file of this.files)
      if (!this.indexed.has(file.id)) {
        const pack = await this.load(file, signal);
        const bytes = pack.objects.get(hash);
        if (bytes) return [bytes.slice()];
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
    for (const file of slice) {
      if (this.delivered.get(file.id) === file.version) continue;
      const pack = await this.load(file, signal);
      for (const id of pack.revisions) revisions.add(id);
    }
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

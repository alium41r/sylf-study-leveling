import Dexie, { type Table } from "dexie";
import * as Y from "yjs";
import { z } from "zod";
import {
  assetSchema,
  bindingSchema,
  commitSchema,
  documentSchema,
  hashSchema,
  idSchema,
  librarySchema,
  objectRefSchema,
  newId,
  OBJECT_BYTES,
  STREAM_BYTES,
  type AssetDescriptor,
  type CloudBinding,
  type ContentRef,
  type DocumentDescriptor,
  type DocumentView,
  type LibraryDescriptor,
  type NotesCommit,
  type ObjectRef,
  type PreparedObject,
  type Revision,
  type SaveReceipt,
  type SaveRequest,
} from "./contracts";
import {
  decodeJson,
  digest,
  encodeJson,
  equalBytes,
  joinContent,
  prepareContent,
} from "./bytes";
import { NotesError, storageError } from "./errors";
import {
  ancestors,
  frontier,
  hasUnrestoredDeletion,
  orderedRevisions,
} from "./graph";
import type { NotesSession } from "./session";
import type { NotesObjectCipher } from "./vault";

interface LibraryRow {
  scope: string;
  descriptor: LibraryDescriptor;
  binding: CloudBinding;
}
interface ObjectRow {
  scope: string;
  hash: string;
  bytes: Uint8Array;
  size?: number;
  role: "object" | "revision";
  documentId?: string;
}
interface JournalRow {
  scope: string;
  id: string;
  documentId: string;
}
interface DocumentRow {
  scope: string;
  documentId: string;
  version: number;
  heads: string[];
  catalog?: { version: number; bytes: Uint8Array };
}
interface OperationRow {
  scope: string;
  operationId: string;
  requestHash: string;
  revisionId: string;
}
interface StageRow {
  scope: string;
  assetId: string;
  asset: AssetDescriptor | Uint8Array;
  state: "staged" | "referenced";
}
export interface OutboxJob {
  scope: string;
  id: string;
  state: "pending" | "uploading" | "verified" | "blocked";
  attempts: number;
  nextAttemptAt: number;
  leaseId?: string;
  leaseUntil?: number;
  error?: string;
  verifiedAt?: string;
}
interface CursorRow {
  scope: string;
  channel: string;
  value: string;
}
interface QuarantineRow {
  scope: string;
  id: string;
  objectId?: string;
  code: string;
  bytes?: Uint8Array;
}

class NotesDatabase extends Dexie {
  libraries!: Table<LibraryRow, string>;
  objects!: Table<ObjectRow, [string, string]>;
  journal!: Table<JournalRow, [string, string]>;
  documents!: Table<DocumentRow, [string, string]>;
  operations!: Table<OperationRow, [string, string]>;
  stages!: Table<StageRow, [string, string]>;
  outbox!: Table<OutboxJob, [string, string]>;
  cursors!: Table<CursorRow, [string, string]>;
  quarantine!: Table<QuarantineRow, [string, string]>;
  constructor(name: string) {
    super(name, { chromeTransactionDurability: "strict" });
    this.version(1).stores({
      libraries: "&scope",
      objects: "&[scope+hash],scope,[scope+role]",
      journal: "&[scope+id],[scope+documentId],scope",
      documents: "&[scope+documentId],scope",
      operations: "&[scope+operationId],scope",
      stages: "&[scope+assetId],scope",
      outbox: "&[scope+id],scope,[scope+state]",
      cursors: "&[scope+channel]",
      quarantine: "&[scope+id],scope",
    });
  }
}

export type FaultPoint =
  | "before-write"
  | "after-objects"
  | "after-journal"
  | "after-outbox"
  | "before-commit"
  | "after-commit";
export interface RepositoryOptions {
  session: NotesSession;
  libraryId: string;
  bindingGeneration: number;
  databaseName?: string;
  cipher?: NotesObjectCipher;
  /** Synchronous diagnostic hook. Throwing before commit must abort the entire transaction. */
  fault?: (point: FaultPoint) => void;
}
const KNOWN_FEATURES = new Set([
  "rich-text-v1",
  "paged-v1",
  "attachments-v1",
  "ink-v1",
]);
const zCatalog = z.object({
  documentId: idSchema,
  updatedAt: z.string(),
  view: z.object({
    descriptor: documentSchema,
    descriptorRef: objectRefSchema,
    heads: z.array(hashSchema),
    state: z.enum(["active", "trashed", "conflict"]),
    alternatives: z.array(objectRefSchema),
  }),
});
const refOf = (object: PreparedObject): ObjectRef => ({
  hash: object.hash,
  size: object.bytes.length,
});
const refsOf = (
  descriptor: DocumentDescriptor,
  commit: NotesCommit
): ObjectRef[] => [
  commit.descriptor,
  ...commit.updates.flatMap((u) => u.content.parts),
  ...descriptor.assets.flatMap((a) => a.content.parts),
];
function parseDescriptor(bytes: Uint8Array): DocumentDescriptor {
  const parsed = documentSchema.safeParse(decodeJson(bytes));
  if (!parsed.success)
    throw new NotesError(
      "UNSUPPORTED",
      "Document schema is invalid or requires a newer reader."
    );
  return parsed.data;
}
function parseCommit(bytes: Uint8Array): NotesCommit {
  const parsed = commitSchema.safeParse(decodeJson(bytes));
  if (!parsed.success)
    throw new NotesError(
      "UNSUPPORTED",
      "Commit schema is invalid or requires a newer reader."
    );
  return parsed.data;
}
export function validateUpdate(bytes: Uint8Array): void {
  if (bytes.length > STREAM_BYTES)
    throw new NotesError(
      "LIMIT",
      "Stream update exceeds supported memory limits."
    );
  try {
    Y.decodeUpdate(bytes);
  } catch (cause) {
    throw new NotesError(
      "CORRUPT",
      "Invalid Yjs update; original state was retained.",
      { cause }
    );
  }
}

/** IndexedDB implementation of the platform-neutral repository API below. No content is sent to Sylf servers. */
export class IndexedDbNotesRepository {
  readonly scope: string;
  readonly libraryId: string;
  readonly session: NotesSession;
  private readonly db: NotesDatabase;
  private readonly writerId = newId();
  private readonly cache = new Map<
    string,
    { version: number; revisions: Revision[] }
  >();
  private readonly verifierCache = new Map<
    string,
    { doc: Y.Doc; bytes: number }
  >();
  private readonly catalogCache = new Map<
    string,
    {
      version: number;
      bytes: number;
      value: { documentId: string; view: DocumentView; updatedAt: string };
    }
  >();
  private readonly listeners = new Set<() => void>();
  private channel?: BroadcastChannel;
  private readonly unlisten: () => void;
  constructor(private readonly options: RepositoryOptions) {
    this.session = options.session;
    this.session.assert();
    this.libraryId = idSchema.parse(options.libraryId);
    this.scope = JSON.stringify([this.session.ownerId, this.libraryId]);
    this.db = new NotesDatabase(options.databaseName ?? "sylf-notes-v1");
    this.db.on("versionchange", () => this.session.close());
    if (
      typeof window !== "undefined" &&
      typeof BroadcastChannel !== "undefined"
    ) {
      this.channel = new BroadcastChannel("sylf-notes-revisions-v1");
      this.channel.onmessage = (event) => {
        if (event.data === this.scope) this.notify(false);
      };
    }
    this.unlisten = this.session.onClose(() => this.close());
  }
  close(): void {
    this.channel?.close();
    this.db.close();
    this.cache.clear();
    this.clearVerifiers();
    this.catalogCache.clear();
    this.listeners.clear();
    this.unlisten?.();
  }
  private verifierKey(
    documentId: string,
    streamId: string,
    epoch: number,
    parents: string[]
  ): string {
    return JSON.stringify([documentId, streamId, epoch, [...parents].sort()]);
  }
  private clearVerifiers() {
    for (const value of this.verifierCache.values()) value.doc.destroy();
    this.verifierCache.clear();
  }
  private rememberVerifier(key: string, doc: Y.Doc, bytes: number): void {
    this.session.assert();
    this.verifierCache.get(key)?.doc.destroy();
    this.verifierCache.set(key, { doc, bytes });
    let size = 0;
    for (const value of this.verifierCache.values()) size += value.bytes;
    while (this.verifierCache.size > 8 || size > 16 * 1024 * 1024) {
      const first = this.verifierCache.keys().next().value!,
        value = this.verifierCache.get(first)!;
      size -= value.bytes;
      value.doc.destroy();
      this.verifierCache.delete(first);
    }
  }
  private rememberRevisions(
    documentId: string,
    value: { version: number; revisions: Revision[] }
  ) {
    this.cache.delete(documentId);
    this.cache.set(documentId, value);
    let count = 0;
    for (const entry of this.cache.values()) count += entry.revisions.length;
    while (this.cache.size > 8 || count > 25000) {
      const first = this.cache.keys().next().value!;
      count -= this.cache.get(first)!.revisions.length;
      this.cache.delete(first);
    }
  }
  subscribe(listener: () => void): () => void {
    this.session.assert();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(broadcast = true): void {
    if (broadcast) this.channel?.postMessage(this.scope);
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* A notification cannot undo a durable save. */
      }
    }
  }
  private async guard(): Promise<LibraryRow> {
    this.session.assert();
    const row = await this.db.libraries.get(this.scope);
    this.session.assert();
    if (!row)
      throw new NotesError(
        "NOT_FOUND",
        "This library has not been provisioned on this device."
      );
    if (
      !librarySchema.safeParse(row.descriptor).success ||
      !bindingSchema.safeParse(row.binding).success
    )
      throw new NotesError(
        "UNSUPPORTED",
        "The stored library header needs a compatible reader or explicit recovery."
      );
    if (
      row.descriptor.ownerRef !== this.session.ownerId ||
      row.descriptor.libraryId !== this.libraryId ||
      row.binding.generation !== this.options.bindingGeneration ||
      row.descriptor.bindingGeneration !== row.binding.generation
    )
      throw new NotesError(
        "OWNERSHIP",
        "Library ownership or cloud binding changed."
      );
    return row;
  }
  private async seal(bytes: Uint8Array, identity: string): Promise<Uint8Array> {
    if (!this.options.cipher) return bytes;
    return Dexie.waitFor(this.options.cipher.seal(bytes, identity));
  }
  private async unseal(
    bytes: Uint8Array,
    identity: string
  ): Promise<Uint8Array> {
    if (!this.options.cipher) return bytes;
    return Dexie.waitFor(this.options.cipher.open(bytes, identity));
  }
  private async storedAsset(
    asset: AssetDescriptor
  ): Promise<AssetDescriptor | Uint8Array> {
    return this.options.cipher
      ? this.seal(encodeJson(asset), `stage:${asset.assetId}`)
      : asset;
  }
  async registerLibrary(
    descriptor: LibraryDescriptor,
    binding: CloudBinding
  ): Promise<void> {
    this.session.assert();
    descriptor = librarySchema.parse(descriptor);
    binding = bindingSchema.parse(binding);
    if (
      descriptor.ownerRef !== this.session.ownerId ||
      descriptor.libraryId !== this.libraryId ||
      descriptor.bindingGeneration !== binding.generation ||
      binding.generation !== this.options.bindingGeneration
    )
      throw new NotesError(
        "OWNERSHIP",
        "Provisioning does not match this access scope."
      );
    try {
      await this.db.transaction("rw", this.db.libraries, async () => {
        this.session.assert();
        const previous = await this.db.libraries.get(this.scope);
        if (
          previous &&
          (!equalBytes(
            encodeJson(previous.descriptor),
            encodeJson(descriptor)
          ) ||
            previous.binding.provider !== binding.provider ||
            previous.binding.accountId !== binding.accountId ||
            previous.binding.rootId !== binding.rootId ||
            previous.binding.generation !== binding.generation)
        )
          throw new NotesError(
            "CONFLICT",
            "Existing cloud binding must not be replaced implicitly."
          );
        if (!previous)
          await this.db.libraries.add({
            scope: this.scope,
            descriptor,
            binding,
          });
        else if (!equalBytes(encodeJson(previous.binding), encodeJson(binding)))
          await this.db.libraries.put({ ...previous, binding });
        this.session.assert();
      });
      this.session.assert();
    } catch (error) {
      const failure = storageError(error);
      if (failure.code === "QUOTA" || failure.code === "STORAGE") {
        // Refreshing proof timestamps is an optional cache write. A full device
        // must still expose recovery for an unchanged, previously enrolled scope.
        try {
          const previous = await this.library();
          if (
            equalBytes(
              encodeJson(previous.descriptor),
              encodeJson(descriptor)
            ) &&
            previous.binding.provider === binding.provider &&
            previous.binding.accountId === binding.accountId &&
            previous.binding.rootId === binding.rootId &&
            previous.binding.generation === binding.generation
          )
            return;
        } catch {
          this.session.assert();
        }
      }
      throw failure;
    }
  }
  async library(): Promise<{
    descriptor: LibraryDescriptor;
    binding: CloudBinding;
  }> {
    const row = await this.guard();
    return structuredClone({
      descriptor: row.descriptor,
      binding: row.binding,
    });
  }
  /** Explicit repair using an authenticated, freshly read original cloud descriptor. Never rebind a valid header. */
  async repairLibraryHeader(
    descriptor: LibraryDescriptor,
    binding: CloudBinding
  ): Promise<void> {
    this.session.assert();
    descriptor = librarySchema.parse(descriptor);
    binding = bindingSchema.parse(binding);
    if (
      descriptor.ownerRef !== this.session.ownerId ||
      descriptor.libraryId !== this.libraryId ||
      descriptor.bindingGeneration !== this.options.bindingGeneration ||
      binding.generation !== this.options.bindingGeneration
    )
      throw new NotesError(
        "OWNERSHIP",
        "Recovery header does not match this owner and library."
      );
    await this.db.transaction(
      "rw",
      [this.db.libraries, this.db.quarantine],
      async () => {
        this.session.assert();
        const previous = await this.db.libraries.get(this.scope);
        if (!previous)
          throw new NotesError(
            "NOT_FOUND",
            "No retained library header needs repair."
          );
        if (
          Number(previous.descriptor?.formatVersion) > 1 ||
          Number(previous.descriptor?.minimumReaderVersion) > 1
        )
          throw new NotesError(
            "UNSUPPORTED",
            "This library requires a newer reader. Recovery must not downgrade its format."
          );
        if (
          librarySchema.safeParse(previous.descriptor).success &&
          bindingSchema.safeParse(previous.binding).success
        )
          throw new NotesError(
            "CONFLICT",
            "A valid binding cannot be replaced through recovery."
          );
        await this.db.quarantine.add({
          scope: this.scope,
          id: newId(),
          code: "original-library-header",
          bytes: await this.seal(encodeJson(previous), "library-header"),
        });
        await this.db.libraries.put({ scope: this.scope, descriptor, binding });
        this.session.assert();
      }
    );
    this.session.assert();
    this.notify();
  }
  async readObject(hash: string): Promise<Uint8Array> {
    hashSchema.parse(hash);
    await this.guard();
    const row = await this.db.objects.get([this.scope, hash]);
    this.session.assert();
    if (!row)
      throw new NotesError(
        "NOT_FOUND",
        "A required immutable object is missing."
      );
    const bytes = await this.unseal(row.bytes, hash);
    if (bytes.length > OBJECT_BYTES || (await digest(bytes)) !== hash)
      throw new NotesError("CORRUPT", "Immutable object checksum failed.");
    this.session.assert();
    return bytes.slice();
  }
  async readContent(ref: ContentRef): Promise<Uint8Array> {
    const bytes = await joinContent(ref, (hash) => this.readObject(hash));
    this.session.assert();
    return bytes;
  }
  private async putObjects(
    objects: PreparedObject[],
    revisions = new Map<string, string>()
  ): Promise<void> {
    for (const object of objects) {
      this.session.assert();
      const previous = await this.db.objects.get([this.scope, object.hash]);
      if (
        previous &&
        !equalBytes(
          await this.unseal(previous.bytes, object.hash),
          object.bytes
        )
      )
        throw new NotesError(
          "CORRUPT",
          "Immutable object collision; use explicit repair."
        );
      const documentId = revisions.get(object.hash);
      if (!previous)
        await this.db.objects.add({
          scope: this.scope,
          hash: object.hash,
          bytes: await this.seal(object.bytes, object.hash),
          size: object.bytes.length,
          role: documentId ? "revision" : "object",
          ...(documentId ? { documentId } : {}),
        });
      else if (documentId && previous.role !== "revision")
        await this.db.objects.put({
          ...previous,
          role: "revision",
          documentId,
        });
    }
  }
  async stageAsset(
    bytes: Uint8Array,
    mediaType: string,
    name: string
  ): Promise<AssetDescriptor> {
    await this.guard();
    const prepared = await prepareContent(bytes);
    this.session.assert();
    const asset = assetSchema.parse({
      assetId: prepared.content.hash,
      mediaType,
      name,
      content: prepared.content,
      extensions: {},
    });
    try {
      await this.db.transaction(
        "rw",
        [this.db.libraries, this.db.objects, this.db.stages],
        async () => {
          await this.guard();
          this.options.fault?.("before-write");
          await this.putObjects(prepared.objects);
          this.options.fault?.("after-objects");
          const old = await this.db.stages.get([this.scope, asset.assetId]);
          if (!old)
            await this.db.stages.add({
              scope: this.scope,
              assetId: asset.assetId,
              asset: await this.storedAsset(asset),
              state: "staged",
            });
          this.session.assert();
          this.options.fault?.("before-commit");
        }
      );
      this.session.assert();
      return asset;
    } catch (error) {
      throw storageError(error);
    }
  }
  async pendingAssets(): Promise<AssetDescriptor[]> {
    await this.guard();
    const rows = await this.db.stages
      .where("scope")
      .equals(this.scope)
      .toArray();
    this.session.assert();
    const assets = await Promise.all(
      rows
        .filter((r) => r.state === "staged")
        .map(async (r) => {
          if (this.options.cipher && !(r.asset instanceof Uint8Array))
            throw new NotesError(
              "CORRUPT",
              "Plaintext asset metadata cannot enter an encrypted library."
            );
          return r.asset instanceof Uint8Array
            ? assetSchema.parse(
                decodeJson(await this.unseal(r.asset, `stage:${r.assetId}`))
              )
            : r.asset;
        })
    );
    this.session.assert();
    return assets;
  }
  private async revisionState(
    documentId: string
  ): Promise<{ version: number; revisions: Revision[] }> {
    await this.guard();
    const row = await this.db.documents.get([this.scope, documentId]);
    this.session.assert();
    const version = row?.version ?? 0,
      cached = this.cache.get(documentId);
    if (cached?.version === version) return cached;
    const journal = await this.db.journal
      .where("[scope+documentId]")
      .equals([this.scope, documentId])
      .toArray();
    const revisions: Revision[] = [];
    for (const item of journal) {
      const commit = parseCommit(await this.readObject(item.id));
      if (
        commit.libraryId !== this.libraryId ||
        commit.documentId !== documentId
      )
        throw new NotesError(
          "CORRUPT",
          "Journal projection does not match its source."
        );
      revisions.push({ id: item.id, commit });
    }
    orderedRevisions(revisions);
    const result = { version, revisions };
    this.rememberRevisions(documentId, result);
    return result;
  }
  async listRevisions(documentId?: string): Promise<Revision[]> {
    await this.guard();
    if (documentId)
      return structuredClone((await this.revisionState(documentId)).revisions);
    const rows = await this.db.journal
      .where("scope")
      .equals(this.scope)
      .toArray();
    const revisions: Revision[] = [];
    for (const row of rows) {
      const commit = parseCommit(await this.readObject(row.id));
      if (
        commit.libraryId !== this.libraryId ||
        commit.documentId !== row.documentId
      )
        throw new NotesError("CORRUPT", "Journal identity mismatch.");
      revisions.push({ id: row.id, commit });
    }
    orderedRevisions(revisions);
    return revisions;
  }
  async descriptor(ref: ObjectRef): Promise<DocumentDescriptor> {
    const bytes = await this.readObject(ref.hash);
    if (bytes.length !== ref.size)
      throw new NotesError("CORRUPT", "Descriptor size mismatch.");
    const descriptor = parseDescriptor(bytes);
    if (descriptor.libraryId !== this.libraryId)
      throw new NotesError(
        "OWNERSHIP",
        "Descriptor belongs to a different library."
      );
    return descriptor;
  }
  async document(documentId: string): Promise<DocumentView> {
    const { revisions } = await this.revisionState(documentId);
    if (!revisions.length)
      throw new NotesError("NOT_FOUND", "Document does not exist.");
    const heads = frontier(revisions),
      map = new Map(revisions.map((r) => [r.id, r]));
    const tips = heads.map((id) => map.get(id)!);
    const ordered = [...tips].sort(
      (a, b) => a.commit.sequence - b.commit.sequence || (a.id < b.id ? -1 : 1)
    );
    const selected =
      ordered.filter((r) => r.commit.kind !== "tombstone").at(-1) ??
      ordered.at(-1)!;
    const alternatives = [
      ...new Map(
        tips.map((r) => [r.commit.descriptor.hash, r.commit.descriptor])
      ).values(),
    ];
    const deleted = tips.every((r) => r.commit.kind === "tombstone");
    const conflict =
      !deleted &&
      (alternatives.length > 1 ||
        tips.some((r) => r.commit.kind === "tombstone") ||
        hasUnrestoredDeletion(heads, map));
    return structuredClone({
      descriptor: await this.descriptor(selected.commit.descriptor),
      descriptorRef: selected.commit.descriptor,
      heads,
      state: deleted
        ? ("trashed" as const)
        : conflict
          ? ("conflict" as const)
          : ("active" as const),
      alternatives,
    });
  }
  async listDocumentIds(offset = 0, limit = 50): Promise<string[]> {
    await this.guard();
    if (offset < 0 || !Number.isSafeInteger(offset) || limit < 1 || limit > 200)
      throw new NotesError("LIMIT", "Invalid catalog page.");
    const rows = await this.db.documents
      .where("scope")
      .equals(this.scope)
      .offset(offset)
      .limit(limit)
      .toArray();
    this.session.assert();
    return rows.map((r) => r.documentId);
  }
  /** Rebuildable, encrypted metadata projection. Journal/immutable source remain authoritative. */
  async catalogPage(
    offset = 0,
    limit = 50
  ): Promise<{ documentId: string; view: DocumentView; updatedAt: string }[]> {
    await this.guard();
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 200
    )
      throw new NotesError("LIMIT", "Invalid catalog page.");
    const rows = await this.db.documents
        .where("scope")
        .equals(this.scope)
        .offset(offset)
        .limit(limit)
        .toArray(),
      result = [];
    for (const row of rows) {
      const memory = this.catalogCache.get(row.documentId);
      if (memory?.version === row.version) {
        result.push(structuredClone(memory.value));
        continue;
      }
      let value:
          | { documentId: string; view: DocumentView; updatedAt: string }
          | undefined,
        size = 0;
      if (row.catalog?.version === row.version) {
        try {
          const bytes = await this.unseal(
            row.catalog.bytes,
            `catalog:${row.documentId}:${row.version}`
          );
          size = bytes.length;
          const parsed = zCatalog.parse(decodeJson(bytes));
          if (
            parsed.documentId !== row.documentId ||
            parsed.view.descriptor.libraryId !== this.libraryId ||
            parsed.view.descriptor.documentId !== row.documentId ||
            JSON.stringify(parsed.view.heads) !== JSON.stringify(row.heads)
          )
            throw new Error("stale projection");
          value = parsed;
        } catch (error) {
          this.session.assert();
          if (error instanceof NotesError && error.code === "SESSION_ENDED")
            throw error; /* Rebuildable cache corruption cannot replace source. */
        }
      }
      if (!value) {
        const view = await this.document(row.documentId),
          revisions = await this.listRevisions(row.documentId);
        value = {
          documentId: row.documentId,
          view,
          updatedAt: revisions.reduce(
            (latest, r) =>
              r.commit.createdAt > latest ? r.commit.createdAt : latest,
            ""
          ),
        };
        try {
          const bytes = encodeJson(value);
          size = bytes.length;
          const stored = await this.seal(
            bytes,
            `catalog:${row.documentId}:${row.version}`
          );
          await this.db.transaction("rw", this.db.documents, async () => {
            this.session.assert();
            const current = await this.db.documents.get([
              this.scope,
              row.documentId,
            ]);
            if (current?.version === row.version)
              await this.db.documents.put({
                ...current,
                catalog: { version: row.version, bytes: stored },
              });
          });
        } catch (error) {
          this.session.assert();
          if (error instanceof NotesError && error.code === "SESSION_ENDED")
            throw error; /* Source was read successfully; optional cache writes may fail on quota. */
        }
      }
      if (size > 0)
        this.catalogCache.set(row.documentId, {
          version: row.version,
          bytes: size,
          value,
        });
      let total = 0;
      for (const entry of this.catalogCache.values()) total += entry.bytes;
      while (total > 16 * 1024 * 1024 || this.catalogCache.size > 2048) {
        const first = this.catalogCache.keys().next().value!;
        total -= this.catalogCache.get(first)!.bytes;
        this.catalogCache.delete(first);
      }
      result.push(structuredClone(value));
    }
    this.session.assert();
    return result;
  }
  async save(request: SaveRequest): Promise<SaveReceipt> {
    await this.guard();
    idSchema.parse(request.documentId);
    idSchema.parse(request.operationId);
    const isRef = objectRefSchema.safeParse(request.descriptor).success;
    const descriptor = isRef
      ? await this.descriptor(request.descriptor as ObjectRef)
      : documentSchema.parse(request.descriptor);
    if (
      descriptor.documentId !== request.documentId ||
      descriptor.libraryId !== this.libraryId
    )
      throw new NotesError(
        "OWNERSHIP",
        "Document scope does not match this library."
      );
    if (
      descriptor.requiredFeatures.some((f) => !KNOWN_FEATURES.has(f)) ||
      descriptor.streams.some((s) => s.codec !== "yjs13-update-v1")
    )
      throw new NotesError(
        "UNSUPPORTED",
        "Required document features are unavailable; preserve/export the original."
      );
    const objects: PreparedObject[] = [],
      updates: NotesCommit["updates"] = [];
    let descriptorRef: ObjectRef;
    if (isRef) descriptorRef = request.descriptor as ObjectRef;
    else {
      const bytes = encodeJson(descriptor),
        object = { hash: await digest(bytes), bytes };
      objects.push(object);
      descriptorRef = refOf(object);
    }
    for (const update of request.updates ?? []) {
      validateUpdate(update.bytes);
      const stream = descriptor.streams.find(
        (s) => s.streamId === update.streamId && s.epoch === update.epoch
      );
      if (!stream || stream.codec !== "yjs13-update-v1")
        throw new NotesError(
          "CONFLICT",
          "Update stream identity or epoch does not match."
        );
      const prepared = await prepareContent(update.bytes);
      objects.push(...prepared.objects);
      updates.push({
        streamId: update.streamId,
        epoch: update.epoch,
        codec: "yjs13-update-v1",
        role: update.role ?? "update",
        content: prepared.content,
        covers: update.role === "checkpoint" ? [...request.parents].sort() : [],
      });
    }
    const kind = request.kind ?? "edit",
      parents = [...request.parents].sort();
    const requestHash = await digest(
      encodeJson({
        documentId: request.documentId,
        descriptor: descriptorRef,
        updates,
        parents,
        kind,
        extensions: request.extensions ?? {},
      })
    );
    this.session.assert();
    for (let attempt = 0; attempt < 8; attempt++) {
      const oldOperation = await this.db.operations.get([
        this.scope,
        request.operationId,
      ]);
      if (oldOperation) {
        if (oldOperation.requestHash !== requestHash)
          throw new NotesError(
            "CONFLICT",
            "Operation ID was reused for different content."
          );
        await this.closure([oldOperation.revisionId]);
        const job = await this.db.outbox.get([
          this.scope,
          oldOperation.revisionId,
        ]);
        await this.guard();
        return {
          revisionId: oldOperation.revisionId,
          state: "local-durable",
          pendingCloud: job?.state !== "verified",
        };
      }
      const state = await this.revisionState(request.documentId),
        map = new Map(state.revisions.map((r) => [r.id, r]));
      if (
        kind === "create"
          ? state.revisions.length > 0 || parents.length > 0
          : !state.revisions.length || !parents.length
      )
        throw new NotesError("CONFLICT", "Create/edit ancestry is invalid.");
      const previous = ancestors(parents, map);
      if (
        kind !== "restore" &&
        kind !== "tombstone" &&
        hasUnrestoredDeletion(parents, map)
      )
        throw new NotesError(
          "CONFLICT",
          "Explicit restoration is required before editing known-deleted content."
        );
      for (const id of parents) {
        const prior = await this.descriptor(map.get(id)!.commit.descriptor);
        for (const stream of descriptor.streams)
          if (
            prior.streams.some(
              (s) => s.streamId === stream.streamId && s.epoch > stream.epoch
            )
          )
            throw new NotesError(
              "CONFLICT",
              "Stream epochs cannot be downgraded."
            );
        for (const stream of descriptor.streams) {
          const old = prior.streams.find((s) => s.streamId === stream.streamId);
          if (
            old &&
            old.epoch < stream.epoch &&
            (kind !== "migrate" ||
              stream.epoch !== old.epoch + 1 ||
              stream.predecessor?.streamId !== old.streamId ||
              stream.predecessor?.epoch !== old.epoch)
          )
            throw new NotesError(
              "CONFLICT",
              "New epochs require an explicit, non-destructive migration relationship."
            );
        }
      }
      const verifiedStates: {
        streamId: string;
        epoch: number;
        doc: Y.Doc;
        bytes: number;
        retained?: boolean;
      }[] = [];
      try {
        for (const update of request.updates ?? []) {
          const key = this.verifierKey(
            request.documentId,
            update.streamId,
            update.epoch,
            parents
          );
          const cached = this.verifierCache.get(key);
          // Consume exclusive ownership before mutation. A concurrent save must replay its
          // own observed frontier; failed/tentative state is never cached under old heads.
          this.verifierCache.delete(key);
          const loaded =
            cached?.doc ??
            (state.revisions.length
              ? (
                  await this.loadStream(
                    request.documentId,
                    update.streamId,
                    update.epoch,
                    parents
                  )
                ).doc
              : new Y.Doc());
          let transferred = false;
          try {
            const bytes = cached?.bytes ?? Y.encodeStateAsUpdate(loaded).length;
            if (update.role === "checkpoint") {
              if (kind !== "checkpoint")
                throw new NotesError(
                  "CONFLICT",
                  "Checkpoints require an explicit checkpoint revision."
                );
              const before = Y.encodeStateAsUpdate(loaded),
                check = new Y.Doc();
              try {
                Y.applyUpdate(check, update.bytes);
                if (!equalBytes(Y.encodeStateAsUpdate(check), before))
                  throw new NotesError(
                    "CORRUPT",
                    "Checkpoint does not preserve its covered native state."
                  );
              } finally {
                check.destroy();
              }
            }
            Y.applyUpdate(loaded, update.bytes);
            if (loaded.store.pendingStructs || loaded.store.pendingDs)
              throw new NotesError(
                "CORRUPT",
                "Update depends on unavailable Yjs history."
              );
            // Conservative encoded-byte budget; this is not a heap-size measurement.
            verifiedStates.push({
              streamId: update.streamId,
              epoch: update.epoch,
              doc: loaded,
              bytes: bytes + update.bytes.length,
            });
            transferred = true;
          } finally {
            if (!transferred) loaded.destroy();
          }
        }
        // A revision can change notebook metadata or a different page without
        // changing this stream's native state. Carry only exact-parent verifiers;
        // ownership and transaction rollback rules remain identical to edits.
        const changedStreams = new Set(
          (request.updates ?? []).map((u) => `${u.streamId}:${u.epoch}`)
        );
        for (const stream of descriptor.streams) {
          if (changedStreams.has(`${stream.streamId}:${stream.epoch}`))
            continue;
          const key = this.verifierKey(
              request.documentId,
              stream.streamId,
              stream.epoch,
              parents
            ),
            cached = this.verifierCache.get(key);
          if (!cached) continue;
          this.verifierCache.delete(key);
          verifiedStates.push({
            streamId: stream.streamId,
            epoch: stream.epoch,
            doc: cached.doc,
            bytes: cached.bytes,
          });
        }
        let sequence = 1;
        for (const id of previous)
          sequence = Math.max(sequence, map.get(id)!.commit.sequence + 1);
        const commit = commitSchema.parse({
          format: "sylf-notes-commit",
          formatVersion: 1,
          minimumReaderVersion: 1,
          libraryId: this.libraryId,
          documentId: request.documentId,
          operationId: request.operationId,
          writerId: this.writerId,
          sequence,
          parents,
          kind,
          descriptor: descriptorRef,
          updates,
          createdAt: new Date().toISOString(),
          extensions: request.extensions ?? {},
        });
        if (kind === "tombstone" && updates.length)
          throw new NotesError(
            "CONFLICT",
            "Deletion cannot replace content bytes."
          );
        const bytes = encodeJson(commit),
          id = await digest(bytes),
          revision: Revision = { id, commit };
        const prepared = [...objects, { hash: id, bytes }],
          combined = [...state.revisions, revision];
        try {
          await this.db.transaction(
            "rw",
            [
              this.db.libraries,
              this.db.objects,
              this.db.journal,
              this.db.documents,
              this.db.operations,
              this.db.outbox,
              this.db.stages,
            ],
            async () => {
              await this.guard();
              this.options.fault?.("before-write");
              const current = await this.db.documents.get([
                this.scope,
                request.documentId,
              ]);
              if (
                (current?.version ?? 0) !== state.version ||
                (await this.db.operations.get([
                  this.scope,
                  request.operationId,
                ]))
              )
                throw new NotesError(
                  "CONFLICT",
                  "Concurrent repository transaction; retry."
                );
              await this.putObjects(
                prepared,
                new Map([[id, request.documentId]])
              );
              this.options.fault?.("after-objects");
              for (const ref of refsOf(descriptor, commit)) {
                const object = await this.db.objects.get([
                  this.scope,
                  ref.hash,
                ]);
                if (
                  !object ||
                  (object.size ?? object.bytes.length) !== ref.size
                )
                  throw new NotesError(
                    "CORRUPT",
                    "Save references an unavailable object."
                  );
              }
              await this.db.journal.add({
                scope: this.scope,
                id,
                documentId: request.documentId,
              });
              this.options.fault?.("after-journal");
              await this.db.outbox.add({
                scope: this.scope,
                id,
                state: "pending",
                attempts: 0,
                nextAttemptAt: 0,
              });
              this.options.fault?.("after-outbox");
              await this.db.operations.add({
                scope: this.scope,
                operationId: request.operationId,
                requestHash,
                revisionId: id,
              });
              await this.db.documents.put({
                scope: this.scope,
                documentId: request.documentId,
                version: state.version + 1,
                heads: frontier(combined),
              });
              for (const asset of descriptor.assets)
                await this.db.stages.put({
                  scope: this.scope,
                  assetId: asset.assetId,
                  asset: await this.storedAsset(asset),
                  state: "referenced",
                });
              this.session.assert();
              this.options.fault?.("before-commit");
            }
          );
        } catch (error) {
          this.cache.delete(request.documentId);
          if (
            error instanceof NotesError &&
            error.code === "CONFLICT" &&
            attempt < 7
          )
            continue;
          throw storageError(error);
        }
        this.rememberRevisions(request.documentId, {
          version: state.version + 1,
          revisions: combined,
        });
        for (const state of verifiedStates) {
          this.rememberVerifier(
            this.verifierKey(request.documentId, state.streamId, state.epoch, [
              id,
            ]),
            state.doc,
            state.bytes
          );
          state.retained = true;
        }
        try {
          this.options.fault?.("after-commit");
        } catch (cause) {
          throw new NotesError(
            "ACK_UNCERTAIN",
            "The transaction committed but acknowledgement was interrupted; retry the same operation.",
            { cause }
          );
        }
        this.session.assert();
        this.notify();
        return { revisionId: id, state: "local-durable", pendingCloud: true };
      } finally {
        for (const state of verifiedStates)
          if (!state.retained) state.doc.destroy();
      }
    }
    throw new NotesError("CONFLICT", "Concurrent writes require retry.");
  }
  async loadStream(
    documentId: string,
    streamId: string,
    epoch: number,
    at?: string[]
  ): Promise<{ doc: Y.Doc; revisions: string[] }> {
    const state = await this.revisionState(documentId),
      map = new Map(state.revisions.map((r) => [r.id, r]));
    if (!state.revisions.length)
      throw new NotesError("NOT_FOUND", "Document stream is unavailable.");
    const view = await this.document(documentId);
    if (
      !view.descriptor.streams.some(
        (s) => s.streamId === streamId && s.epoch === epoch
      ) &&
      !at
    )
      throw new NotesError(
        "CONFLICT",
        "Select an existing stream epoch explicitly."
      );
    const selected = at ? ancestors(at, map) : new Set(map.keys());
    const revisions = orderedRevisions(
      state.revisions.filter((r) => selected.has(r.id))
    );
    const candidates = revisions.flatMap((r) =>
      r.commit.updates
        .filter((u) => u.streamId === streamId && u.epoch === epoch)
        .map((update) => ({ revision: r, update }))
    );
    const checkpoint = [...candidates]
      .reverse()
      .find((c) => c.update.role === "checkpoint");
    const covered = checkpoint
      ? ancestors(checkpoint.update.covers, map)
      : new Set<string>();
    const doc = new Y.Doc();
    try {
      const apply = async (update: NotesCommit["updates"][number]) => {
        const bytes = await this.readContent(update.content);
        validateUpdate(bytes);
        Y.applyUpdate(doc, bytes, "repository-replay");
      };
      if (checkpoint) await apply(checkpoint.update);
      for (const { revision, update } of candidates)
        if (
          !covered.has(revision.id) &&
          revision.id !== checkpoint?.revision.id
        )
          await apply(update);
      if (doc.store.pendingStructs || doc.store.pendingDs)
        throw new NotesError(
          "CORRUPT",
          "Stream history is causally incomplete; do not expose an empty or partial note as saved."
        );
      this.session.assert();
      return { doc, revisions: revisions.map((r) => r.id) };
    } catch (error) {
      doc.destroy();
      throw error instanceof NotesError
        ? error
        : new NotesError(
            "CORRUPT",
            "Stream reconstruction failed; history was retained.",
            { cause: error }
          );
    }
  }
  async checkpoint(
    documentId: string,
    streamId: string,
    epoch: number
  ): Promise<SaveReceipt> {
    const view = await this.document(documentId),
      loaded = await this.loadStream(documentId, streamId, epoch, view.heads);
    try {
      return await this.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor: view.descriptorRef,
        kind: "checkpoint",
        updates: [
          {
            streamId,
            epoch,
            bytes: Y.encodeStateAsUpdate(loaded.doc),
            role: "checkpoint",
          },
        ],
      });
    } finally {
      loaded.doc.destroy();
    }
  }
  /** All raw objects in a revision's history, including assets. Useful for verified upload/export, never per pointer sample. */
  async closure(ids: string[]): Promise<PreparedObject[]> {
    const map = new Map<string, Revision>(),
      pending = [...ids];
    while (pending.length) {
      const id = pending.pop()!;
      if (map.has(id)) continue;
      if (map.size >= 50000)
        throw new NotesError(
          "LIMIT",
          "Revision closure exceeds this operation's budget."
        );
      const commit = parseCommit(await this.readObject(id));
      if (commit.libraryId !== this.libraryId)
        throw new NotesError(
          "OWNERSHIP",
          "Revision belongs to another library."
        );
      map.set(id, { id, commit });
      pending.push(...commit.parents);
    }
    const all = [...map.values()],
      wanted = ancestors(ids, map),
      objects = new Map<string, PreparedObject>(),
      verifiedContents = new Set<string>();
    for (const revision of orderedRevisions(
      all.filter((r) => wanted.has(r.id))
    )) {
      const descriptor = await this.descriptor(revision.commit.descriptor);
      for (const ref of refsOf(descriptor, revision.commit)) {
        if (!objects.has(ref.hash)) {
          const bytes = await this.readObject(ref.hash);
          if (bytes.length !== ref.size)
            throw new NotesError("CORRUPT", "Dependency size mismatch.");
          objects.set(ref.hash, { hash: ref.hash, bytes });
        }
      }
      for (const update of revision.commit.updates) {
        const key = JSON.stringify(update.content);
        if (verifiedContents.has(key)) continue;
        const bytes = await joinContent(
          update.content,
          async (hash) => objects.get(hash)!.bytes
        );
        validateUpdate(bytes);
        verifiedContents.add(key);
      }
      for (const asset of descriptor.assets) {
        const key = JSON.stringify(asset.content);
        if (verifiedContents.has(key)) continue;
        await joinContent(
          asset.content,
          async (hash) => objects.get(hash)!.bytes
        );
        verifiedContents.add(key);
      }
      objects.set(revision.id, {
        hash: revision.id,
        bytes: await this.readObject(revision.id),
      });
    }
    return [...objects.values()];
  }
  /** Atomically adopt a completely verified import/download page and its cursor. No partial page activation. */
  async installBatch(
    objects: PreparedObject[],
    revisionIds: string[],
    source: "archive" | "remote",
    cursor?: { channel: string; value: string }
  ): Promise<void> {
    await this.guard();
    const incoming = new Map<string, Uint8Array>();
    for (const object of objects) {
      const bytes = object.bytes.slice();
      if (
        bytes.length > OBJECT_BYTES ||
        (await digest(bytes)) !== object.hash ||
        incoming.has(object.hash)
      )
        throw new NotesError(
          "CORRUPT",
          "Invalid or duplicate incoming object."
        );
      incoming.set(object.hash, bytes);
      this.session.assert();
    }
    const read = async (hash: string) =>
      incoming.get(hash) ?? this.readObject(hash);
    const revisions: Revision[] = [];
    for (const id of [...new Set(revisionIds)]) {
      const commit = parseCommit(await read(id));
      if (commit.libraryId !== this.libraryId)
        throw new NotesError(
          "OWNERSHIP",
          "Incoming library identity does not match."
        );
      const descriptorBytes = await read(commit.descriptor.hash),
        descriptor = parseDescriptor(descriptorBytes);
      if (
        descriptorBytes.length !== commit.descriptor.size ||
        descriptor.libraryId !== this.libraryId ||
        descriptor.documentId !== commit.documentId
      )
        throw new NotesError(
          "CORRUPT",
          "Incoming descriptor identity mismatch."
        );
      if (
        descriptor.requiredFeatures.some((f) => !KNOWN_FEATURES.has(f)) ||
        descriptor.streams.some((s) => s.codec !== "yjs13-update-v1")
      )
        throw new NotesError(
          "UNSUPPORTED",
          "Incoming required feature needs a newer reader."
        );
      for (const ref of refsOf(descriptor, commit)) {
        const bytes = await read(ref.hash);
        if (bytes.length !== ref.size || (await digest(bytes)) !== ref.hash)
          throw new NotesError(
            "CORRUPT",
            "Incoming dependency failed verification."
          );
      }
      for (const update of commit.updates) {
        if (
          !descriptor.streams.some(
            (s) =>
              s.streamId === update.streamId &&
              s.epoch === update.epoch &&
              s.codec === update.codec
          )
        )
          throw new NotesError("CORRUPT", "Incoming stream identity mismatch.");
        validateUpdate(await joinContent(update.content, read));
        if (
          update.role === "checkpoint" &&
          JSON.stringify([...update.covers].sort()) !==
            JSON.stringify([...commit.parents].sort())
        )
          throw new NotesError(
            "CORRUPT",
            "Checkpoint does not declare its exact covered frontier."
          );
      }
      for (const asset of descriptor.assets)
        await joinContent(asset.content, read);
      revisions.push({ id, commit });
    }
    const operationHashes = new Map<string, string>();
    for (const { commit } of revisions) {
      const hash = await digest(
        encodeJson({
          documentId: commit.documentId,
          descriptor: commit.descriptor,
          updates: commit.updates,
          parents: [...commit.parents].sort(),
          kind: commit.kind,
          extensions: commit.extensions,
        })
      );
      if (
        operationHashes.has(commit.operationId) &&
        operationHashes.get(commit.operationId) !== hash
      )
        throw new NotesError(
          "CONFLICT",
          "Incoming operation identity collision."
        );
      operationHashes.set(commit.operationId, hash);
    }
    const documents = [...new Set(revisions.map((r) => r.commit.documentId))],
      states = new Map<string, { version: number; revisions: Revision[] }>();
    for (const id of documents) {
      const state = await this.revisionState(id),
        merged = new Map(state.revisions.map((r) => [r.id, r]));
      for (const revision of revisions.filter(
        (r) => r.commit.documentId === id
      ))
        merged.set(revision.id, revision);
      const combined = [...merged.values()];
      orderedRevisions(combined);
      states.set(id, { version: state.version, revisions: combined });
    }
    // Validate checkpoint claims against preserved ancestry, not just state-vector sizes.
    // Imported bytes must never make an empty checkpoint hide the only original update.
    for (const [documentId, state] of states) {
      const map = new Map(state.revisions.map((r) => [r.id, r]));
      for (const revision of orderedRevisions(state.revisions)) {
        if (
          revision.commit.kind === "tombstone" &&
          revision.commit.updates.length
        )
          throw new NotesError(
            "CORRUPT",
            "Deletion contains replacement content."
          );
        for (const update of revision.commit.updates.filter(
          (u) => u.role === "checkpoint"
        )) {
          const covered = ancestors(revision.commit.parents, map),
            baseline = new Y.Doc(),
            checkpoint = new Y.Doc();
          try {
            for (const prior of orderedRevisions(
              state.revisions.filter((r) => covered.has(r.id))
            ))
              for (const item of prior.commit.updates) {
                if (
                  item.streamId === update.streamId &&
                  item.epoch === update.epoch
                )
                  Y.applyUpdate(
                    baseline,
                    await joinContent(item.content, read)
                  );
              }
            Y.applyUpdate(checkpoint, await joinContent(update.content, read));
            if (
              !equalBytes(
                Y.encodeStateAsUpdate(baseline),
                Y.encodeStateAsUpdate(checkpoint)
              ) ||
              baseline.store.pendingStructs ||
              baseline.store.pendingDs
            )
              throw new NotesError(
                "CORRUPT",
                "Incoming checkpoint has false coverage."
              );
          } finally {
            baseline.destroy();
            checkpoint.destroy();
          }
        }
      }
      const streams = new Map<string, Y.Doc>();
      try {
        for (const revision of orderedRevisions(state.revisions))
          for (const update of revision.commit.updates) {
            const key = update.streamId + ":" + update.epoch,
              doc = streams.get(key) ?? new Y.Doc();
            streams.set(key, doc);
            Y.applyUpdate(doc, await joinContent(update.content, read));
          }
        for (const doc of streams.values())
          if (doc.store.pendingStructs || doc.store.pendingDs)
            throw new NotesError(
              "CORRUPT",
              "Incoming history is causally incomplete."
            );
      } finally {
        for (const doc of streams.values()) doc.destroy();
      }
      void documentId;
    }
    try {
      await this.db.transaction(
        "rw",
        [
          this.db.libraries,
          this.db.objects,
          this.db.journal,
          this.db.documents,
          this.db.outbox,
          this.db.cursors,
          this.db.operations,
        ],
        async () => {
          await this.guard();
          this.options.fault?.("before-write");
          for (const [id, state] of states)
            if (
              ((await this.db.documents.get([this.scope, id]))?.version ??
                0) !== state.version
            )
              throw new NotesError(
                "CONFLICT",
                "Document changed while import was being verified; retry the import."
              );
          await this.putObjects(
            [...incoming].map(([hash, bytes]) => ({ hash, bytes })),
            new Map(revisions.map((r) => [r.id, r.commit.documentId]))
          );
          this.options.fault?.("after-objects");
          for (const revision of revisions) {
            const operation = await this.db.operations.get([
              this.scope,
              revision.commit.operationId,
            ]);
            const requestHash = operationHashes.get(
              revision.commit.operationId
            )!;
            if (operation && operation.requestHash !== requestHash)
              throw new NotesError(
                "CONFLICT",
                "Operation identity collision during import."
              );
            if (!operation)
              await this.db.operations.add({
                scope: this.scope,
                operationId: revision.commit.operationId,
                requestHash,
                revisionId: revision.id,
              });
            await this.db.journal.put({
              scope: this.scope,
              id: revision.id,
              documentId: revision.commit.documentId,
            });
            const job = await this.db.outbox.get([this.scope, revision.id]);
            if (!job || source === "remote")
              await this.db.outbox.put({
                scope: this.scope,
                id: revision.id,
                state: source === "remote" ? "verified" : "pending",
                attempts: 0,
                nextAttemptAt: 0,
                ...(source === "remote"
                  ? { verifiedAt: new Date().toISOString() }
                  : {}),
              });
          }
          this.options.fault?.("after-journal");
          this.options.fault?.("after-outbox");
          for (const [id, state] of states)
            await this.db.documents.put({
              scope: this.scope,
              documentId: id,
              version: state.version + 1,
              heads: frontier(state.revisions),
            });
          if (cursor)
            await this.db.cursors.put({
              scope: this.scope,
              channel: cursor.channel,
              value: cursor.value,
            });
          this.session.assert();
          this.options.fault?.("before-commit");
        }
      );
      for (const id of documents) this.cache.delete(id);
      this.session.assert();
      this.notify();
    } catch (error) {
      throw storageError(error);
    }
  }
  async jobs(): Promise<OutboxJob[]> {
    await this.guard();
    const jobs = await this.db.outbox
      .where("scope")
      .equals(this.scope)
      .toArray();
    this.session.assert();
    return jobs;
  }
  async claimJob(now = Date.now(), leaseMs = 60000): Promise<OutboxJob | null> {
    await this.guard();
    return this.db.transaction(
      "rw",
      [this.db.libraries, this.db.outbox],
      async () => {
        await this.guard();
        const rows = await this.db.outbox
          .where("scope")
          .equals(this.scope)
          .toArray();
        const job = rows.find(
          (j) =>
            (j.state === "pending" && j.nextAttemptAt <= now) ||
            (j.state === "uploading" && (j.leaseUntil ?? 0) <= now)
        );
        if (!job) return null;
        const claimed: OutboxJob = {
          ...job,
          state: "uploading",
          leaseId: newId(),
          leaseUntil: now + leaseMs,
        };
        await this.db.outbox.put(claimed);
        this.session.assert();
        return claimed;
      }
    );
  }
  async settleJob(
    id: string,
    leaseId: string,
    result:
      | { verified: true }
      | { verified: false; code: string; retryAt: number; blocked?: boolean }
  ): Promise<void> {
    await this.guard();
    await this.db.transaction(
      "rw",
      [this.db.libraries, this.db.outbox],
      async () => {
        await this.guard();
        const job = await this.db.outbox.get([this.scope, id]);
        if (!job || job.state !== "uploading" || job.leaseId !== leaseId)
          throw new NotesError(
            "CONFLICT",
            "Upload lease is stale; do not acknowledge it."
          );
        await this.db.outbox.put({
          scope: this.scope,
          id,
          state: result.verified
            ? "verified"
            : result.blocked
              ? "blocked"
              : "pending",
          attempts: job.attempts + 1,
          nextAttemptAt: result.verified ? 0 : result.retryAt,
          ...(result.verified
            ? { verifiedAt: new Date().toISOString() }
            : { error: result.code.slice(0, 128) }),
        });
        this.session.assert();
      }
    );
    this.session.assert();
    this.notify();
  }
  async cursor(channel: string): Promise<string | undefined> {
    await this.guard();
    const row = await this.db.cursors.get([this.scope, channel]);
    this.session.assert();
    return row?.value;
  }
  async resumeBlockedJobs(): Promise<void> {
    await this.guard();
    await this.db.transaction(
      "rw",
      [this.db.libraries, this.db.outbox],
      async () => {
        await this.guard();
        const rows = await this.db.outbox
          .where("[scope+state]")
          .equals([this.scope, "blocked"])
          .toArray();
        for (const row of rows)
          await this.db.outbox.put({
            ...row,
            state: "pending",
            nextAttemptAt: 0,
          });
        this.session.assert();
      }
    );
  }
  async quarantine(
    code: string,
    objectId?: string,
    bytes?: Uint8Array
  ): Promise<void> {
    await this.guard();
    if (bytes && bytes.length > OBJECT_BYTES)
      throw new NotesError("LIMIT", "Quarantine item is too large.");
    await this.db.quarantine.put({
      scope: this.scope,
      id: newId(),
      code: code.slice(0, 128),
      objectId,
      bytes: bytes
        ? await this.seal(bytes.slice(), objectId ?? "quarantine")
        : undefined,
    });
    this.session.assert();
  }
  async repairObject(hash: string, candidate: Uint8Array): Promise<void> {
    await this.guard();
    if (candidate.length > OBJECT_BYTES || (await digest(candidate)) !== hash)
      throw new NotesError(
        "CORRUPT",
        "Repair candidate is not the original content."
      );
    try {
      await this.db.transaction(
        "rw",
        [
          this.db.libraries,
          this.db.objects,
          this.db.quarantine,
          this.db.journal,
        ],
        async () => {
          await this.guard();
          const old = await this.db.objects.get([this.scope, hash]);
          if (
            old &&
            (!this.options.cipher || !equalBytes(old.bytes, candidate))
          )
            await this.db.quarantine.add({
              scope: this.scope,
              id: newId(),
              objectId: hash,
              code: "replaced-corrupt-object",
              bytes: old.bytes,
            });
          const known = await this.db.journal.get([this.scope, hash]);
          await this.db.objects.put({
            ...old,
            scope: this.scope,
            hash,
            bytes: await this.seal(candidate.slice(), hash),
            size: candidate.length,
            role: old?.role ?? (known ? "revision" : "object"),
            ...(known ? { documentId: known.documentId } : {}),
          });
          this.session.assert();
        }
      );
      this.cache.clear();
      this.session.assert();
      this.notify();
    } catch (error) {
      throw storageError(error);
    }
  }
  /** Rebuild only the derived catalog. Never deletes source objects, history, stages or pending jobs. */
  async rebuildCatalog(): Promise<void> {
    const revisions = await this.listRevisions(),
      grouped = new Map<string, Revision[]>();
    for (const revision of revisions)
      grouped.set(revision.commit.documentId, [
        ...(grouped.get(revision.commit.documentId) ?? []),
        revision,
      ]);
    await this.db.transaction(
      "rw",
      [this.db.libraries, this.db.documents, this.db.journal, this.db.outbox],
      async () => {
        await this.guard();
        if (
          (await this.db.journal.where("scope").equals(this.scope).count()) !==
          revisions.length
        )
          throw new NotesError(
            "CONFLICT",
            "Journal changed during catalog repair; retry."
          );
        for (const [documentId, items] of grouped) {
          const old = await this.db.documents.get([this.scope, documentId]);
          await this.db.documents.put({
            scope: this.scope,
            documentId,
            version: (old?.version ?? 0) + 1,
            heads: frontier(items),
          });
          for (const revision of items)
            if (!(await this.db.outbox.get([this.scope, revision.id])))
              await this.db.outbox.add({
                scope: this.scope,
                id: revision.id,
                state: "pending",
                attempts: 0,
                nextAttemptAt: 0,
              });
        }
        this.session.assert();
      }
    );
    this.cache.clear();
    this.session.assert();
    this.notify();
  }
  async storageStats(): Promise<{
    objects: number;
    objectBytes: number;
    revisions: number;
    pending: number;
    stagedAssets: number;
  }> {
    await this.guard();
    let objects = 0,
      objectBytes = 0;
    await this.db.objects
      .where("scope")
      .equals(this.scope)
      .each((object) => {
        objects++;
        objectBytes += object.bytes.length;
      });
    const jobs = await this.jobs();
    return {
      objects,
      objectBytes,
      revisions: await this.db.journal
        .where("scope")
        .equals(this.scope)
        .count(),
      pending: jobs.filter((j) => j.state !== "verified").length,
      stagedAssets: (await this.pendingAssets()).length,
    };
  }
  /** Explicit source-marker scan repairs lost journal/catalog/queue indexes. Asset JSON is never mistaken for a commit. */
  async recoverLostJournal(documentId?: string): Promise<number> {
    await this.guard();
    const source = await this.db.objects
      .where("[scope+role]")
      .equals([this.scope, "revision"])
      .toArray();
    const revisions: Revision[] = [];
    for (const row of source) {
      if (documentId && row.documentId !== documentId) continue;
      const commit = parseCommit(await this.readObject(row.hash));
      if (
        commit.libraryId !== this.libraryId ||
        commit.documentId !== row.documentId
      )
        throw new NotesError(
          "CORRUPT",
          "Source revision marker is damaged; preserve it for repair."
        );
      revisions.push({ id: row.hash, commit });
    }
    orderedRevisions(revisions);
    await this.closure(frontier(revisions));
    const grouped = new Map<string, Revision[]>(),
      operationHashes = new Map<string, string>();
    for (const revision of revisions) {
      const c = revision.commit;
      grouped.set(c.documentId, [
        ...(grouped.get(c.documentId) ?? []),
        revision,
      ]);
      const requestHash = await digest(
        encodeJson({
          documentId: c.documentId,
          descriptor: c.descriptor,
          updates: c.updates,
          parents: [...c.parents].sort(),
          kind: c.kind,
          extensions: c.extensions,
        })
      );
      if (
        operationHashes.has(c.operationId) &&
        operationHashes.get(c.operationId) !== requestHash
      )
        throw new NotesError(
          "CORRUPT",
          "Source operation identities conflict."
        );
      operationHashes.set(c.operationId, requestHash);
    }
    await this.db.transaction(
      "rw",
      [
        this.db.libraries,
        this.db.objects,
        this.db.journal,
        this.db.documents,
        this.db.operations,
        this.db.outbox,
      ],
      async () => {
        await this.guard();
        if (
          (await this.db.objects
            .where("[scope+role]")
            .equals([this.scope, "revision"])
            .count()) !== source.length
        )
          throw new NotesError(
            "CONFLICT",
            "Source revisions changed during repair; retry."
          );
        for (const revision of revisions) {
          await this.db.journal.put({
            scope: this.scope,
            id: revision.id,
            documentId: revision.commit.documentId,
          });
          if (!(await this.db.outbox.get([this.scope, revision.id])))
            await this.db.outbox.add({
              scope: this.scope,
              id: revision.id,
              state: "pending",
              attempts: 0,
              nextAttemptAt: 0,
            });
          if (
            !(await this.db.operations.get([
              this.scope,
              revision.commit.operationId,
            ]))
          )
            await this.db.operations.add({
              scope: this.scope,
              operationId: revision.commit.operationId,
              requestHash: operationHashes.get(revision.commit.operationId)!,
              revisionId: revision.id,
            });
        }
        for (const [id, items] of grouped) {
          const old = await this.db.documents.get([this.scope, id]);
          await this.db.documents.put({
            scope: this.scope,
            documentId: id,
            version: (old?.version ?? 0) + 1,
            heads: frontier(items),
          });
        }
        this.session.assert();
      }
    );
    this.cache.clear();
    this.clearVerifiers();
    this.session.assert();
    this.notify();
    return revisions.length;
  }
  async inspectIntegrity(): Promise<{
    issues: { id: string; code: string }[];
    recoverableHeads: Record<string, string[]>;
  }> {
    await this.guard();
    const issues: { id: string; code: string }[] = [],
      valid: Revision[] = [];
    const journal = await this.db.journal
      .where("scope")
      .equals(this.scope)
      .toArray();
    const journalIds = new Set(journal.map((row) => row.id));
    const sources = await this.db.objects
      .where("[scope+role]")
      .equals([this.scope, "revision"])
      .primaryKeys();
    for (const key of sources)
      if (!journalIds.has(key[1]))
        issues.push({ id: key[1], code: "JOURNAL_MISSING" });
    for (const row of journal) {
      try {
        await this.closure([row.id]);
        valid.push({
          id: row.id,
          commit: parseCommit(await this.readObject(row.id)),
        });
      } catch (error) {
        issues.push({
          id: row.id,
          code: error instanceof NotesError ? error.code : "CORRUPT",
        });
      }
    }
    const groups = new Map<string, Revision[]>();
    for (const revision of valid)
      groups.set(revision.commit.documentId, [
        ...(groups.get(revision.commit.documentId) ?? []),
        revision,
      ]);
    this.session.assert();
    return {
      issues,
      recoverableHeads: Object.fromEntries(
        [...groups].map(([id, revisions]) => [id, frontier(revisions)])
      ),
    };
  }
}

/** Structural contract for future SQLite/files adapters; consumers do not receive Dexie tables. */
export type NotesRepository = Pick<
  IndexedDbNotesRepository,
  | "session"
  | "libraryId"
  | "scope"
  | "library"
  | "repairLibraryHeader"
  | "stageAsset"
  | "pendingAssets"
  | "save"
  | "document"
  | "listDocumentIds"
  | "catalogPage"
  | "readObject"
  | "readContent"
  | "descriptor"
  | "listRevisions"
  | "loadStream"
  | "checkpoint"
  | "closure"
  | "installBatch"
  | "jobs"
  | "claimJob"
  | "settleJob"
  | "resumeBlockedJobs"
  | "cursor"
  | "quarantine"
  | "repairObject"
  | "rebuildCatalog"
  | "recoverLostJournal"
  | "storageStats"
  | "inspectIntegrity"
  | "subscribe"
>;

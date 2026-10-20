import * as Y from "yjs";
import { z } from "zod";
import { digest } from "./bytes";
import {
  newId,
  type DocumentDescriptor,
  type DocumentView,
  type CloudBinding,
  type LibraryDescriptor,
} from "./contracts";
import { IndexedDbNotesRepository } from "./repository";
import {
  createBrowserNotesSession,
  registerNotesFlush,
  type NotesSession,
} from "./session";
import { createNotesVault } from "./vault";
import { GoogleDriveTransport, notesRequest } from "./drive-transport";
import { NotesSynchronizer, TransportError } from "./sync";
import {
  NotesStream,
  recoverUnacknowledged,
  retainedNotesRecovery,
  observeNotesRecovery,
} from "./engine";
import { initialRichTextUpdate } from "./blocknote-adapter";
import { INK_ADAPTER, initialInkUpdate } from "./ink";
import { projectFolderMoves } from "./graph";
import { NotesError } from "./errors";
import { notesResumeSchema, type NotesResumePosition } from "@/lib/resources";

const folderOp = z.object({
  folderId: z.uuid(),
  name: z.string().min(1).max(160),
  parentId: z.uuid().nullable(),
  deleted: z.boolean(),
  sequence: z.number().int().positive(),
  writerId: z.uuid(),
  operationId: z.uuid(),
});
export interface NotesFolder {
  id: string;
  name: string;
  parentId: string | null;
  recovered: boolean;
}
export interface NoteSummary {
  id: string;
  view: DocumentView;
  updatedAt: string;
  preview: string;
  searchText: string;
  resume?: NotesResumePosition;
}
export interface NotesCloudConnection {
  descriptor: LibraryDescriptor;
  binding: CloudBinding;
  label: string;
  status: string;
}
export interface LibrarySnapshot {
  notes: NoteSummary[];
  folders: NotesFolder[];
  ready: boolean;
  syncing: boolean;
  pending: number;
  error?: string;
  searchIndexed: number;
  searchTotal: number;
  searchLimited?: boolean;
  verifiedAt?: string;
  memoryPending?: number;
  localUploads?: number;
}
async function derivedId(libraryId: string, label: string) {
  const h = (await digest(new TextEncoder().encode(libraryId + ":" + label)))
    .slice(0, 32)
    .split("");
  h[12] = "5";
  h[16] = "a";
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Notes could not finish this operation. Your local data was retained.";

/** Document-only orchestration. No Workspace/Session state or server content store. */
export class NotesLibrary {
  readonly repository: IndexedDbNotesRepository;
  readonly session: NotesSession;
  private readonly transport: GoogleDriveTransport;
  private readonly syncEngine: NotesSynchronizer;
  private readonly listeners = new Set<() => void>();
  private readonly active = new Set<NotesStream>();
  private readonly writer = newId();
  private readonly urls = new Map<string, string>();
  private readonly beforeClose = new Set<() => Promise<void>>();
  private readonly beforeCloseDisposers = new Map<
    () => Promise<void>,
    () => void
  >();
  private catalog?: NotesStream;
  private unlistenCatalog?: () => void;
  private catalogId = "";
  private catalogStreamId = "";
  private snapshotValue: LibrarySnapshot = {
    notes: [],
    folders: [],
    ready: false,
    syncing: false,
    pending: 0,
    searchIndexed: 0,
    searchTotal: 0,
  };
  private timer?: ReturnType<typeof setInterval>;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private syncing?: Promise<void>;
  private verifiedListing = -1;
  private retryAfterAt = 0;
  private needsReconnect = false;
  private refreshing?: Promise<void>;
  private indexing?: Promise<void>;
  private readonly indexedHeads = new Map<string, string>();
  private readonly unlisten: () => void;
  private readonly unlistenRecovery: () => void;
  private closed = false;
  private constructor(
    readonly connection: NotesCloudConnection,
    repository: IndexedDbNotesRepository
  ) {
    this.repository = repository;
    this.session = repository.session;
    this.transport = new GoogleDriveTransport(
      {
        ownerId: this.session.ownerId,
        libraryId: connection.descriptor.libraryId,
        bindingGeneration: connection.binding.generation,
        provider: "google-drive",
        accountId: connection.binding.accountId,
        rootId: connection.binding.rootId,
      },
      this.session
    );
    this.syncEngine = new NotesSynchronizer(repository, this.transport);
    this.unlistenRecovery = observeNotesRecovery((ownerId, libraryId) => {
      if (
        !this.closed &&
        ownerId === this.session.ownerId &&
        libraryId === this.repository.libraryId &&
        !this.session.signal.aborted
      ) {
        this.updateRecovery();
        if (this.snapshotValue.memoryPending)
          this.snapshotValue.verifiedAt = undefined;
        this.emit();
      }
    });
    this.unlisten = repository.subscribe(() => {
      const changed =
        !this.snapshotValue.pending || !!this.snapshotValue.verifiedAt;
      this.snapshotValue.pending = Math.max(1, this.snapshotValue.pending);
      this.snapshotValue.verifiedAt = undefined;
      if (changed) this.emit();
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(
        () => void this.refresh().catch((error) => this.setError(error)),
        700
      );
    });
    this.session.onClose(() => this.close());
  }
  static async unlock(
    ownerId: string,
    guard: () => boolean,
    repairHeader = false
  ): Promise<NotesLibrary> {
    const session = createBrowserNotesSession(ownerId, guard);
    try {
      const raw = await (
        await notesRequest(
          `/api/notes/unlock${repairHeader ? "?verify=1" : ""}`,
          {
            method: "POST",
            signal: session.signal,
          }
        )
      ).json();
      session.assert();
      if (raw.descriptor?.ownerRef !== ownerId)
        throw new NotesError(
          "OWNERSHIP",
          "Notes belongs to another signed-in user."
        );
      const key = Uint8Array.from(atob(z.string().parse(raw.vaultKey)), (c) =>
        c.charCodeAt(0)
      );
      delete raw.vaultKey;
      const cipher = await createNotesVault(
        key,
        JSON.stringify([ownerId, raw.descriptor.libraryId]),
        session
      );
      const repository = new IndexedDbNotesRepository({
        session,
        libraryId: raw.descriptor.libraryId,
        bindingGeneration: raw.binding.generation,
        cipher,
        databaseName: `sylf-notes-vault-v1:${ownerId}:${raw.descriptor.libraryId}`,
      });
      if (repairHeader) {
        if (!raw.headerVerified)
          throw new NotesError(
            "OWNERSHIP",
            "Original cloud header verification is required."
          );
        await repository.repairLibraryHeader(raw.descriptor, raw.binding);
      } else await repository.registerLibrary(raw.descriptor, raw.binding);
      let recoveryError: unknown;
      try {
        await recoverUnacknowledged(repository);
      } catch (error) {
        session.assert();
        recoveryError = error;
      }
      const library = new NotesLibrary(raw, repository);
      await library.initialize();
      library.snapshotValue.memoryPending =
        retainedNotesRecovery(repository).length;
      if (recoveryError)
        library.setError(
          "Unacknowledged edits are retained in this tab. Export their recovery copy or retry saving before closing it."
        );
      return library;
    } catch (error) {
      session.close();
      throw error;
    }
  }
  /** Internal qualification supplies a real repository with synthetic provisioning; production uses unlock(). */
  static async fromRepository(
    connection: NotesCloudConnection,
    repository: IndexedDbNotesRepository
  ): Promise<NotesLibrary> {
    const library = new NotesLibrary(connection, repository);
    await library.initialize();
    return library;
  }
  private async initialize() {
    this.catalogId = await derivedId(this.repository.libraryId, "catalog");
    this.catalogStreamId = await derivedId(
      this.repository.libraryId,
      "catalog-stream"
    );
    try {
      await this.repository.document(this.catalogId);
      await this.openCatalog();
      this.snapshotValue.ready = true;
      await this.refresh();
    } catch (error) {
      if (!(error instanceof NotesError) || error.code !== "NOT_FOUND")
        throw error;
    }
    if (this.snapshotValue.ready)
      void this.synchronize().catch((error) => this.setError(error));
    else await this.synchronize().catch((error) => this.setError(error));
    this.session.assert();
    this.timer = setInterval(() => {
      void this.synchronize().catch((error) => this.setError(error));
    }, 10000);
    window.addEventListener("online", this.online);
    window.addEventListener("focus", this.online);
    void navigator.storage?.persist?.().catch(() => {});
  }
  private online = () => {
    void this.synchronize().catch((error) => this.setError(error));
  };
  recoverySnapshots() {
    this.session.assert();
    const snapshots = retainedNotesRecovery(this.repository);
    for (const stream of [
      ...this.active,
      ...(this.catalog ? [this.catalog] : []),
    ]) {
      if (stream.status().state !== "closed" && stream.status().pending)
        snapshots.push(stream.recoverySnapshot());
    }
    return snapshots;
  }
  private updateRecovery() {
    if (this.closed || this.session.signal.aborted) return;
    const count = this.recoverySnapshots().length;
    if (count === this.snapshotValue.memoryPending) return;
    this.snapshotValue.memoryPending = count;
    if (count) this.snapshotValue.verifiedAt = undefined;
    this.emit();
  }
  private async openCatalog() {
    if (this.catalog) return;
    this.catalog = await NotesStream.open(
      this.repository,
      this.catalogId,
      this.catalogStreamId,
      1,
      { deferRecovery: true }
    );
    this.unlistenCatalog = this.catalog.subscribe((state) => {
      if (state === "failed" || this.snapshotValue.memoryPending)
        this.updateRecovery();
    });
  }
  private async ensureCatalog() {
    try {
      await this.repository.document(this.catalogId);
    } catch (error) {
      if (!(error instanceof NotesError) || error.code !== "NOT_FOUND")
        throw error;
      const descriptor = this.descriptor(
        this.catalogId,
        this.catalogStreamId,
        "Library organization",
        "flow"
      );
      descriptor.streams[0].adapter = "sylf-library/1";
      descriptor.streams[0].projection = { root: "folders", type: "map" };
      descriptor.extensions = { sylfInternal: "library-v1" };
      const doc = new Y.Doc();
      try {
        await this.repository.save({
          operationId: newId(),
          documentId: this.catalogId,
          parents: [],
          descriptor,
          kind: "create",
          updates: [
            {
              streamId: this.catalogStreamId,
              epoch: 1,
              bytes: Y.encodeStateAsUpdate(doc),
            },
          ],
        });
      } finally {
        doc.destroy();
      }
    }
    await this.openCatalog();
    this.snapshotValue.ready = true;
  }
  private descriptor(
    documentId: string,
    streamId: string,
    title: string,
    kind: "flow" | "notebook"
  ): DocumentDescriptor {
    return {
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId: this.repository.libraryId,
      documentId,
      kind,
      title,
      schemaVersion: 1,
      folderId: null,
      subjectId: null,
      streams: [
        {
          streamId,
          epoch: 1,
          codec: "yjs13-update-v1",
          adapter: "blocknote/0.56.0",
          schemaVersion: 1,
          projection: { root: "body", type: "xml" },
        },
      ],
      pages:
        kind === "notebook"
          ? [
              {
                pageId: newId(),
                streamId,
                width: 800,
                height: 1100,
                extensions: {},
              },
            ]
          : [],
      assets: [],
      requiredFeatures: ["rich-text-v1"],
      extensions: {},
    };
  }
  private emit() {
    if (this.closed) return;
    this.snapshotValue = { ...this.snapshotValue };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* UI observers cannot change persistence. */
      }
    }
  }
  snapshot = () => this.snapshotValue;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private setError(error: unknown) {
    if (this.closed) return;
    this.snapshotValue.error = errorText(error);
    this.emit();
  }
  async synchronize(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.session.assert();
    if (this.needsReconnect || Date.now() < this.retryAfterAt) return;
    this.syncing = (async () => {
      this.session.assert();
      this.snapshotValue.syncing = true;
      this.emit();
      try {
        if (!navigator.onLine)
          throw new Error(
            "Offline. Changes save on this device and will sync when you reconnect."
          );
        await this.syncEngine.pull();
        if (this.syncEngine.downloadIncomplete)
          throw new NotesError(
            "LIMIT",
            "Drive discovery is still catching up. Notes will continue scanning; local originals are retained."
          );
        await this.ensureCatalog();
        await this.catalog!.flush();
        const publishStarted = Date.now();
        for (let batch = 0; batch < 5; batch++) {
          const published = await this.syncEngine.publish(100);
          this.session.assert();
          if (published < 100 || Date.now() - publishStarted >= 5000) break;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        if (this.verifiedListing !== this.transport.listingVersion) {
          await this.syncEngine.verifyAcknowledged();
          this.verifiedListing = this.transport.listingVersion;
        }
        const pending = (await this.repository.jobs()).filter(
          (j) => j.state !== "verified"
        ).length;
        this.snapshotValue.pending = pending;
        this.snapshotValue.error = undefined;
        if (!pending) this.snapshotValue.verifiedAt = new Date().toISOString();
        await this.refresh();
      } catch (error) {
        if (error instanceof TransportError) {
          if (error.code === "AUTH") this.needsReconnect = true;
          if (error.code === "THROTTLE")
            this.retryAfterAt = Date.now() + Math.max(1000, error.retryAfterMs);
        }
        this.snapshotValue.verifiedAt = undefined;
        this.setError(error);
        throw error;
      } finally {
        if (!this.closed) {
          this.snapshotValue.syncing = false;
          this.snapshotValue.pending = (await this.repository.jobs()).filter(
            (j) => j.state !== "verified"
          ).length;
          this.emit();
        }
      }
    })().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }
  async retrySync() {
    this.needsReconnect = false;
    await this.repository.resumeBlockedJobs();
    return this.synchronize();
  }
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const summaries: NoteSummary[] = [],
        old = new Map(this.snapshotValue.notes.map((n) => [n.id, n]));
      for (let offset = 0; ; offset += 200) {
        const rows = await this.repository.catalogPage(offset, 200);
        for (const { documentId: id, view, updatedAt } of rows) {
          if (id === this.catalogId) continue;
          const prior = old.get(id),
            resume = notesResumeSchema.safeParse(
              this.catalog?.doc.getMap("resume").get(id) ??
                view.descriptor.extensions.resume
            );
          summaries.push({
            id,
            view,
            updatedAt,
            preview: prior?.preview || "",
            searchText: prior?.searchText || "",
            ...(resume.success ? { resume: resume.data } : {}),
          });
        }
        if (rows.length < 200) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.session.assert();
      this.snapshotValue.notes = summaries;
      if (this.catalog) {
        const ops = [...this.catalog.doc.getMap("folders").values()]
          .map((value) => folderOp.safeParse(value))
          .filter((result) => result.success)
          .map((result) => result.data!);
        ops.sort(
          (a, b) =>
            a.sequence - b.sequence ||
            (a.writerId < b.writerId
              ? -1
              : a.writerId > b.writerId
                ? 1
                : a.operationId < b.operationId
                  ? -1
                  : 1)
        );
        const latest = new Map(ops.map((op) => [op.folderId, op])),
          projected = projectFolderMoves(
            ops.filter((op) => !latest.get(op.folderId)!.deleted)
          );
        this.snapshotValue.folders = [...latest.values()]
          .filter((op) => !op.deleted)
          .map((op) => ({
            id: op.folderId,
            name: op.name,
            parentId: projected.parents[op.folderId] ?? null,
            recovered: projected.recovered.includes(op.folderId),
          }));
      }
      this.snapshotValue.pending = (await this.repository.jobs()).filter(
        (j) => j.state !== "verified"
      ).length;
      this.snapshotValue.searchTotal = summaries.length;
      this.snapshotValue.memoryPending = this.recoverySnapshots().length;
      this.snapshotValue.localUploads = (
        await this.repository.pendingAssets()
      ).length;
      if (this.snapshotValue.localUploads)
        this.snapshotValue.verifiedAt = undefined;
      if (this.snapshotValue.memoryPending)
        this.snapshotValue.verifiedAt = undefined;
      this.emit();
    })().finally(() => {
      this.refreshing = undefined;
    });
    await this.refreshing;
    void this.indexSearch().catch((error) => this.setError(error));
  }
  async indexSearch() {
    if (this.indexing) return this.indexing;
    this.indexing = (async () => {
      this.snapshotValue.searchIndexed = 0;
      this.snapshotValue.searchLimited = false;
      let indexedCharacters = this.snapshotValue.notes.reduce(
        (n, note) => n + note.searchText.length,
        0
      );
      for (const note of [...this.snapshotValue.notes]) {
        this.session.assert();
        if (this.indexedHeads.get(note.id) === note.view.heads.join(":")) {
          this.snapshotValue.searchIndexed++;
          continue;
        }
        if (indexedCharacters > 16000000) {
          this.snapshotValue.searchLimited = true;
          this.emit();
          break;
        }
        const parts: string[] = [];
        for (const stream of note.view.descriptor.streams) {
          if (stream.adapter !== "blocknote/0.56.0") continue;
          const loaded = await this.repository.loadStream(
            note.id,
            stream.streamId,
            stream.epoch,
            note.view.heads
          );
          try {
            parts.push(
              loaded.doc
                .getXmlFragment("body")
                .toString()
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
            );
          } finally {
            loaded.doc.destroy();
          }
        }
        const current = this.snapshotValue.notes.find((n) => n.id === note.id);
        if (current) {
          indexedCharacters -= current.searchText.length;
          current.searchText = parts.join(" ").toLocaleLowerCase();
          indexedCharacters += current.searchText.length;
          current.preview = parts.join(" ").slice(0, 180);
          if (current.view.heads.join(":") === note.view.heads.join(":"))
            this.indexedHeads.set(note.id, note.view.heads.join(":"));
        }
        this.snapshotValue.searchIndexed++;
        this.emit();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    })().finally(() => {
      this.indexing = undefined;
    });
    return this.indexing;
  }
  async create(
    title = "Untitled note",
    kind: "flow" | "notebook" = "flow",
    folderId: string | null = null,
    pageType: "typed" | "ink" = "typed"
  ) {
    if (!this.snapshotValue.ready)
      throw new NotesError(
        "CONFLICT",
        "Restore and verify the library before creating documents."
      );
    const documentId = newId(),
      streamId = newId(),
      descriptor = this.descriptor(
        documentId,
        streamId,
        title.trim().slice(0, 500) || "Untitled note",
        kind
      );
    descriptor.folderId = folderId;
    if (pageType === "ink") {
      if (kind !== "notebook")
        throw new NotesError(
          "CONFLICT",
          "Handwriting requires a fixed notebook page."
        );
      descriptor.streams[0].adapter = INK_ADAPTER;
      descriptor.streams[0].projection = { root: "ink", type: "map" };
      descriptor.requiredFeatures = ["ink-v1", "paged-v1"];
    }
    await this.repository.save({
      operationId: newId(),
      documentId,
      parents: [],
      descriptor,
      kind: "create",
      updates: [
        {
          streamId,
          epoch: 1,
          bytes:
            pageType === "ink"
              ? initialInkUpdate()
              : await initialRichTextUpdate(),
        },
      ],
    });
    await this.refresh();
    return documentId;
  }
  async open(documentId: string, pageId?: string) {
    const view = await this.repository.document(documentId),
      descriptor = view.descriptor;
    const page = pageId
      ? descriptor.pages.find((p) => p.pageId === pageId)
      : descriptor.pages[0];
    if (pageId && !page)
      throw new NotesError(
        "NOT_FOUND",
        "This notebook page is unavailable; the document was retained."
      );
    if (page?.extensions.archived)
      throw new NotesError(
        "CONFLICT",
        "Restore this retained page before writing on it."
      );
    const definition =
      descriptor.streams.find((s) => s.streamId === page?.streamId) ||
      descriptor.streams[0];
    if (
      !definition ||
      !["blocknote/0.56.0", INK_ADAPTER].includes(definition.adapter)
    )
      throw new NotesError(
        "UNSUPPORTED",
        "This document requires its original reader."
      );
    const stream = await NotesStream.open(
      this.repository,
      documentId,
      definition.streamId,
      definition.epoch
    );
    this.active.add(stream);
    const unlisten = stream.subscribe((state) => {
      if (state === "failed" || this.snapshotValue.memoryPending)
        this.updateRecovery();
    });
    return {
      stream,
      release: () => {
        unlisten();
        this.active.delete(stream);
        stream.close();
      },
    };
  }
  async mutate(
    documentId: string,
    change: (descriptor: DocumentDescriptor) => void,
    kind: "edit" | "restore" | "tombstone" = "edit"
  ) {
    const streams = [...this.active].filter(
      (s) => s.documentId === documentId && s.status().state !== "closed"
    );
    const resume = streams.filter((s) => s.status().state !== "pausing");
    streams.forEach((s) => s.pause());
    try {
      await Promise.all(streams.map((s) => s.flush()));
      const view = await this.repository.document(documentId);
      if (view.state === "conflict" && kind === "edit")
        throw new NotesError(
          "CONFLICT",
          "Review the preserved alternatives before changing this document."
        );
      const descriptor = structuredClone(view.descriptor);
      change(descriptor);
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor,
        kind,
      });
      if (kind === "tombstone") streams.forEach((s) => s.close());
      else await Promise.all(streams.map((s) => s.acceptMetadata()));
      await this.refresh();
    } finally {
      resume.forEach((s) => s.resume());
    }
  }
  async folder(
    name: string,
    parentId: string | null,
    id = newId(),
    deleted = false
  ) {
    if (
      retainedNotesRecovery(this.repository).some(
        (s) => s.documentId === this.catalogId
      )
    )
      throw new NotesError(
        "CONFLICT",
        "Recover pending library changes before changing folders."
      );
    if (!this.catalog)
      throw new NotesError("CONFLICT", "Wait for library recovery.");
    const records = this.catalog.doc.getMap("folders");
    let sequence = 1;
    for (const value of records.values()) {
      const parsed = folderOp.safeParse(value);
      if (parsed.success)
        sequence = Math.max(sequence, parsed.data.sequence + 1);
    }
    const operationId = newId();
    records.set(
      operationId,
      folderOp.parse({
        folderId: id,
        name: name.trim().slice(0, 160) || "Untitled folder",
        parentId,
        deleted,
        sequence,
        writerId: this.writer,
        operationId,
      })
    );
    await this.catalog.flush();
    await this.refresh();
    return id;
  }
  async duplicate(documentId: string, revisionId?: string) {
    const source = await this.repository.document(documentId);
    const old = revisionId
      ? (await this.repository.listRevisions(documentId)).find(
          (r) => r.id === revisionId
        )
      : undefined;
    if (revisionId && !old)
      throw new NotesError(
        "NOT_FOUND",
        "That history revision is unavailable."
      );
    const descriptor = structuredClone(
        old
          ? await this.repository.descriptor(old.commit.descriptor)
          : source.descriptor
      ),
      updates = [];
    descriptor.documentId = newId();
    descriptor.title = `${descriptor.title} copy`.slice(0, 500);
    delete descriptor.extensions.resume;
    const streamIds = new Map<string, string>();
    for (const stream of descriptor.streams) {
      const old = stream.streamId,
        loaded = await this.repository.loadStream(
          documentId,
          old,
          stream.epoch,
          revisionId ? [revisionId] : source.heads
        );
      stream.streamId = newId();
      streamIds.set(old, stream.streamId);
      try {
        updates.push({
          streamId: stream.streamId,
          epoch: stream.epoch,
          bytes: Y.encodeStateAsUpdate(loaded.doc),
        });
      } finally {
        loaded.doc.destroy();
      }
    }
    descriptor.pages = descriptor.pages.map((page) => ({
      ...page,
      pageId: newId(),
      streamId: streamIds.get(page.streamId)!,
    }));
    await this.repository.save({
      operationId: newId(),
      documentId: descriptor.documentId,
      parents: [],
      descriptor,
      kind: "create",
      updates,
    });
    await this.refresh();
    return descriptor.documentId;
  }
  async resolveConflict(documentId: string, choice: string) {
    const active = [...this.active].filter(
      (s) => s.documentId === documentId && s.status().state !== "closed"
    );
    if (active.some((stream) => stream.status().pending))
      throw new NotesError(
        "CONFLICT",
        "Save or export pending edits before choosing a version."
      );
    active.forEach((stream) => stream.pause());
    try {
      const view = await this.repository.document(documentId),
        selected = view.alternatives.find((ref) => ref.hash === choice);
      if (!selected)
        throw new NotesError(
          "CONFLICT",
          "Refresh the preserved alternatives before choosing."
        );
      const descriptor = await this.repository.descriptor(selected);
      for (const ref of view.alternatives) {
        const alternative = await this.repository.descriptor(ref);
        for (const asset of alternative.assets)
          if (!descriptor.assets.some((a) => a.assetId === asset.assetId))
            descriptor.assets.push(asset);
        for (const stream of alternative.streams)
          if (!descriptor.streams.some((s) => s.streamId === stream.streamId))
            descriptor.streams.push(stream);
        for (const page of alternative.pages)
          if (!descriptor.pages.some((p) => p.pageId === page.pageId))
            descriptor.pages.push(page);
      }
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor,
        kind: "restore",
      });
      for (const stream of active) {
        stream.close();
        this.active.delete(stream);
      }
      await this.refresh();
    } finally {
      active.forEach((stream) => stream.resume());
    }
  }
  async addPage(documentId: string, copyPageId?: string) {
    const streams = [...this.active].filter(
      (s) => s.documentId === documentId && s.status().state !== "closed"
    );
    const resume = streams.filter((s) => s.status().state !== "pausing");
    streams.forEach((s) => s.pause());
    try {
      await Promise.all(streams.map((s) => s.flush()));
      const view = await this.repository.document(documentId),
        descriptor = structuredClone(view.descriptor),
        streamId = newId(),
        pageId = newId();
      if (descriptor.kind !== "notebook" || view.state !== "active")
        throw new NotesError(
          "CONFLICT",
          "Restore or resolve this notebook before adding pages."
        );
      const sourcePage = copyPageId
        ? descriptor.pages.find((p) => p.pageId === copyPageId)
        : undefined;
      if (copyPageId && !sourcePage)
        throw new NotesError("NOT_FOUND", "The original page is unavailable.");
      const sourceStream =
        descriptor.streams.find((s) => s.streamId === sourcePage?.streamId) ||
        descriptor.streams[0];
      const ink = sourceStream.adapter === INK_ADAPTER;
      descriptor.streams.push({
        streamId,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: ink ? INK_ADAPTER : "blocknote/0.56.0",
        schemaVersion: 1,
        projection: ink
          ? { root: "ink", type: "map" }
          : { root: "body", type: "xml" },
        ...(sourcePage
          ? {
              predecessor: {
                streamId: sourceStream.streamId,
                epoch: sourceStream.epoch,
                heads: view.heads,
              },
            }
          : {}),
      });
      descriptor.pages.push({
        pageId,
        streamId,
        width: sourcePage?.width || 800,
        height: sourcePage?.height || 1100,
        extensions: {},
      });
      let bytes = ink ? initialInkUpdate() : await initialRichTextUpdate();
      if (sourcePage) {
        const loaded = await this.repository.loadStream(
          documentId,
          sourceStream.streamId,
          sourceStream.epoch,
          view.heads
        );
        try {
          bytes = Y.encodeStateAsUpdate(loaded.doc);
        } finally {
          loaded.doc.destroy();
        }
      }
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor,
        updates: [{ streamId, epoch: 1, bytes }],
      });
      await Promise.all(streams.map((s) => s.acceptMetadata()));
      await this.refresh();
      return pageId;
    } finally {
      resume.forEach((s) => s.resume());
    }
  }
  async movePage(documentId: string, pageId: string, direction: -1 | 1) {
    await this.mutate(documentId, (d) => {
      const active = d.pages.filter((p) => !p.extensions.archived),
        index = active.findIndex((p) => p.pageId === pageId),
        target = active[index + direction];
      if (index < 0 || !target) return;
      const from = d.pages.findIndex((p) => p.pageId === pageId),
        to = d.pages.findIndex((p) => p.pageId === target.pageId);
      [d.pages[from], d.pages[to]] = [d.pages[to], d.pages[from]];
    });
  }
  async archivePage(documentId: string, pageId: string, archived: boolean) {
    await this.mutate(documentId, (d) => {
      const page = d.pages.find((p) => p.pageId === pageId);
      if (!page) throw new NotesError("NOT_FOUND", "This page is unavailable.");
      if (
        archived &&
        !page.extensions.archived &&
        d.pages.filter((p) => !p.extensions.archived).length < 2
      )
        throw new NotesError(
          "CONFLICT",
          "Keep at least one active page in this notebook."
        );
      page.extensions.archived = archived;
    });
  }
  async uploadImage(documentId: string, file: File) {
    if (
      !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
      file.size > 16 * 1024 * 1024
    )
      throw new NotesError(
        "LIMIT",
        "Choose a PNG, JPEG, WebP or GIF image up to 16 MiB."
      );
    const asset = await this.repository.stageAsset(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
      file.name
    );
    await this.mutate(documentId, (descriptor) => {
      if (!descriptor.assets.some((a) => a.assetId === asset.assetId))
        descriptor.assets.push(asset);
    });
    return `sylf-asset:${asset.assetId}`;
  }
  async resolveImage(documentId: string, url: string) {
    this.session.assert();
    if (!/^sylf-asset:[a-f0-9]{64}$/.test(url))
      throw new NotesError(
        "UNSUPPORTED",
        "Upload images into Notes instead of loading external image URLs."
      );
    const cached = this.urls.get(url);
    if (cached) return cached;
    const descriptor = (await this.repository.document(documentId)).descriptor,
      asset = descriptor.assets.find((a) => `sylf-asset:${a.assetId}` === url);
    if (!asset)
      throw new NotesError("CORRUPT", "This image reference needs recovery.");
    const bytes = await this.repository.readContent(asset.content);
    this.session.assert();
    const objectURL = URL.createObjectURL(
      new Blob([bytes.slice().buffer], { type: asset.mediaType })
    );
    this.urls.set(url, objectURL);
    return objectURL;
  }
  async saveResume(documentId: string, position: NotesResumePosition) {
    this.session.assert();
    if (
      retainedNotesRecovery(this.repository).some(
        (s) => s.documentId === this.catalogId
      )
    )
      throw new NotesError(
        "CONFLICT",
        "Recover pending library changes before updating positions."
      );
    const parsed = notesResumeSchema.parse(position);
    if (!this.catalog)
      throw new NotesError(
        "CONFLICT",
        "Wait for library recovery before saving a position."
      );
    await this.repository.document(documentId);
    const positions = this.catalog.doc.getMap("resume");
    if (JSON.stringify(positions.get(documentId)) === JSON.stringify(parsed))
      return;
    positions.set(documentId, parsed);
    await this.catalog.flush();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.refreshTimer);
    window.removeEventListener("online", this.online);
    window.removeEventListener("focus", this.online);
    this.unlisten();
    this.unlistenRecovery();
    for (const remove of this.beforeCloseDisposers.values()) remove();
    this.beforeCloseDisposers.clear();
    this.beforeClose.clear();
    this.unlistenCatalog?.();
    this.catalog?.close();
    for (const stream of this.active) stream.close();
    this.active.clear();
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
    this.indexedHeads.clear();
    this.snapshotValue = {
      notes: [],
      folders: [],
      ready: false,
      syncing: false,
      pending: 0,
      searchIndexed: 0,
      searchTotal: 0,
    };
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* Closing access cannot be vetoed by a view. */
      }
    }
    this.listeners.clear();
    this.session.close();
    this.repository.close();
  }
  registerBeforeClose(callback: () => Promise<void>) {
    this.beforeClose.add(callback);
    const removeFlush = registerNotesFlush(this.session.ownerId, callback);
    this.beforeCloseDisposers.set(callback, removeFlush);
    return () => {
      this.beforeClose.delete(callback);
      removeFlush();
      this.beforeCloseDisposers.delete(callback);
    };
  }
  async retryMemoryRecovery() {
    for (const stream of [
      ...this.active,
      ...(this.catalog ? [this.catalog] : []),
    ])
      if (stream.status().state === "failed" && stream.status().pending)
        await stream.retry();
    await recoverUnacknowledged(this.repository);
    await this.catalog?.refresh();
    this.snapshotValue.error = undefined;
    await this.refresh();
  }
  async flushEditors() {
    // Includes pending title/resume metadata before exports, duplication or logout.
    await Promise.all([...this.beforeClose].map((fn) => fn()));
    await Promise.all(
      [...this.active]
        .filter((s) => s.status().state !== "closed")
        .map((s) => s.flush())
    );
  }
  async dispose() {
    try {
      await this.flushEditors();
      await this.catalog?.flush();
    } finally {
      this.close();
    }
  }
}

import * as Y from "yjs";
import { z } from "zod";
import { digest } from "./bytes";
import { automaticSyncDue, isLocalDraft } from "./cloud-policy";
import { DrivePublications } from "./drive-publication";
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
import { INK_ADAPTER, InkModel, initialInkUpdate } from "./ink";
import {
  PDF_ADAPTER,
  PDF_LIMITS,
  pdfSourcePageSchema,
  type PdfSourcePage,
  initialPdfUpdate,
  displayedPageSize,
} from "./pdf";
import {
  notesPreferencesSchema,
  readNoteStyle,
  type NoteStyle,
  type NotesPreferences,
} from "./note-style";
import { textFragments } from "./text-boxes";
import {
  editPageContent,
  type ContentEdit,
  type ContentPage,
} from "./content-edit";
import type { ContentSelection } from "./content-layout";
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
type PageLayers = {
  page: DocumentDescriptor["pages"][number];
  text: DocumentDescriptor["streams"][number];
  ink: DocumentDescriptor["streams"][number];
};
export interface NotesCloudConnection {
  descriptor: LibraryDescriptor;
  binding: CloudBinding;
  label: string;
  status: string;
  driveLayoutVersion?: number;
}
export interface LibrarySnapshot {
  notes: NoteSummary[];
  folders: NotesFolder[];
  ready: boolean;
  syncing: boolean;
  pending: number;
  error?: string;
  errorCode?: string;
  cloudErrorSince?: number;
  backupDelayed?: boolean;
  searchIndexed: number;
  searchTotal: number;
  searchLimited?: boolean;
  verifiedAt?: string;
  memoryPending?: number;
  localUploads?: number;
  localDrafts?: number;
  localReady?: boolean;
  catalogComplete?: boolean;
  restorePending?: boolean;
}
export interface NotesAccessInfo {
  configured: boolean;
  notesUrl?: string | null;
  localAccess?: boolean;
  connection: NotesCloudConnection | null;
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
  private readonly publications: DrivePublications;
  private readonly listeners = new Set<() => void>();
  private readonly active = new Set<NotesStream>();
  private readonly documentWrites = new Map<string, Promise<unknown>>();
  private serializeDocument<T>(
    id: string,
    write: () => Promise<T>
  ): Promise<T> {
    const previous = this.documentWrites.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(write);
    this.documentWrites.set(id, task);
    return task.finally(() => {
      if (this.documentWrites.get(id) === task) this.documentWrites.delete(id);
    });
  }
  private readonly openingLayers = new Map<string, Promise<PageLayers>>();
  async whenDocumentIdle(documentId: string) {
    let pending = this.documentWrites.get(documentId);
    while (pending) {
      await pending;
      pending = this.documentWrites.get(documentId);
    }
    this.session.assert();
  }
  private readonly writer = newId();
  private readonly imageResolvers = new Set<() => void>();
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
  private catalogStartup?: Promise<void>;
  private readonly indexedHeads = new Map<string, string>();
  private readonly unlisten: () => void;
  private readonly unlistenRecovery: () => void;
  private closed = false;
  private lastEdit = 0;
  private lastCloud = 0;
  private readonly draftHeads = new Map<
    string,
    { heads: string; draft: boolean }
  >();
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
      this.session,
      (hash) => repository.readObject(hash)
    );
    this.syncEngine = new NotesSynchronizer(repository, this.transport);
    this.publications = new DrivePublications(repository);
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
      if (!this.syncing) this.lastEdit = Date.now();
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
    const library = await this.unlockInternal(ownerId, guard, repairHeader);
    if (!library)
      throw new NotesError("OWNERSHIP", "Notes access is unavailable.");
    return library;
  }
  static async bootstrap(
    ownerId: string,
    guard: () => boolean,
    repairHeader: boolean,
    onAccess: (access: NotesAccessInfo) => boolean,
    onEmptyDevice?: () => boolean
  ): Promise<NotesLibrary | undefined> {
    return this.unlockInternal(
      ownerId,
      guard,
      repairHeader,
      onAccess,
      onEmptyDevice
    );
  }
  private static async unlockInternal(
    ownerId: string,
    guard: () => boolean,
    repairHeader: boolean,
    onAccess?: (access: NotesAccessInfo) => boolean,
    onEmptyDevice?: () => boolean
  ): Promise<NotesLibrary | undefined> {
    const session = createBrowserNotesSession(ownerId, guard);
    try {
      const raw = await (
        await notesRequest(
          `/api/notes/unlock?${new URLSearchParams({ ...(repairHeader ? { verify: "1" } : {}), ...(onAccess ? { bootstrap: "1" } : {}) })}`,
          {
            method: "POST",
            signal: AbortSignal.any([
              session.signal,
              AbortSignal.timeout(15000),
            ]),
          }
        )
      ).json();
      session.assert();
      if (onAccess) {
        // The raw fallback supports an older broker during an atomic rollout.
        const access = raw.access || {
          configured: true,
          localAccess: true,
          connection: raw.descriptor ? raw : null,
        };
        if (!onAccess(access) || !raw.descriptor) {
          session.close();
          return;
        }
      }
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
      if (
        onEmptyDevice &&
        !retainedNotesRecovery(repository).length &&
        !(await repository.hasLocalData()) &&
        !onEmptyDevice()
      ) {
        repository.close();
        session.close();
        return;
      }
      const library = new NotesLibrary(raw, repository);
      await library.initialize(true);
      library.snapshotValue.memoryPending =
        retainedNotesRecovery(repository).length;
      if (recoveryError)
        library.setError(
          "Unacknowledged edits are retained in this tab. Export their recovery copy or retry saving before closing it."
        );
      return library;
    } catch (error) {
      session.close();
      if (error instanceof Error && error.name === "TimeoutError")
        throw new Error(
          "Opening Notes took too long. Try again; your local notes are retained."
        );
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
  private async initialize(progressive = false) {
    this.catalogId = await derivedId(this.repository.libraryId, "catalog");
    this.catalogStreamId = await derivedId(
      this.repository.libraryId,
      "catalog-stream"
    );
    const localCatalog =
      progressive && (await this.repository.hasDocument(this.catalogId));
    if (progressive) this.snapshotValue.restorePending = !localCatalog;
    if (progressive) {
      await this.refresh(true);
      this.snapshotValue.localReady =
        localCatalog || this.snapshotValue.notes.length > 0;
    }
    const startCatalog = async () => {
      try {
        await this.repository.document(this.catalogId);
        await this.openCatalog();
        this.snapshotValue.ready = true;
        await this.refresh();
      } catch (error) {
        if (!(error instanceof NotesError) || error.code !== "NOT_FOUND")
          throw error;
      }
    };
    if (progressive) {
      this.catalogStartup = startCatalog().finally(() => {
        // A failed local replay must not permanently poison explicit recovery.
        this.catalogStartup = undefined;
      });
      void this.catalogStartup
        .then(() => this.synchronize())
        .catch((error) => {
          if (!this.closed) this.setError(error);
        });
    } else {
      await startCatalog();
      if (this.snapshotValue.ready)
        void this.synchronize().catch((error) => this.setError(error));
      else await this.synchronize().catch((error) => this.setError(error));
    }
    this.session.assert();
    this.timer = setInterval(() => {
      if (
        automaticSyncDue(
          Date.now(),
          this.lastEdit,
          this.lastCloud,
          this.snapshotValue.pending > (this.snapshotValue.localDrafts || 0)
        )
      )
        void this.synchronize().catch((error) => this.setError(error));
    }, 5000);
    window.addEventListener("online", this.online);
    window.addEventListener("focus", this.online);
    if (
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function"
    )
      document.addEventListener("visibilitychange", this.visibility);
    void navigator.storage?.persist?.().catch(() => {});
  }
  private online = () => {
    if (
      automaticSyncDue(
        Date.now(),
        this.lastEdit,
        this.lastCloud,
        this.snapshotValue.pending > 0
      )
    )
      this.requestCloudSync();
  };
  private visibility = () => {
    if (document.visibilityState === "hidden") {
      void this.flushEditors()
        .then(() => this.requestCloudSync())
        .catch((error) => this.setError(error));
    }
  };
  requestCloudSync() {
    if (!this.closed)
      void this.synchronize().catch((error) => this.setError(error));
  }
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
  private unacknowledgedRecoveryCount() {
    this.session.assert();
    let count = retainedNotesRecovery(this.repository).length;
    for (const stream of [
      ...this.active,
      ...(this.catalog ? [this.catalog] : []),
    ]) {
      if (stream.status().state === "failed" && stream.status().pending > 0)
        count++;
    }
    return count;
  }
  private updateRecovery() {
    if (this.closed || this.session.signal.aborted) return;
    const count = this.unacknowledgedRecoveryCount();
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
    this.snapshotValue.cloudErrorSince ??= Date.now();
    this.snapshotValue.errorCode =
      error instanceof TransportError || error instanceof NotesError
        ? error.code
        : "NETWORK";
    this.snapshotValue.backupDelayed =
      this.snapshotValue.errorCode === "NETWORK" &&
      Date.now() - this.snapshotValue.cloudErrorSince >= 5 * 60_000;
    this.emit();
  }
  async synchronize(): Promise<void> {
    if (this.catalogStartup) await this.catalogStartup;
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
        await this.syncEngine.pull("primary", 100, async () => {
          if (
            !this.catalog &&
            (await this.repository.hasDocument(this.catalogId))
          ) {
            await this.openCatalog();
            this.snapshotValue.ready = true;
          }
          if (
            !this.snapshotValue.localReady ||
            !this.snapshotValue.catalogComplete
          ) {
            await this.refresh(true);
          }
          this.snapshotValue.localReady =
            !!this.catalog || this.snapshotValue.notes.length > 0;
          this.emit();
        });
        if (this.syncEngine.downloadIncomplete)
          throw new NotesError(
            "LIMIT",
            "Drive discovery is still catching up. Notes will continue scanning; local originals are retained."
          );
        this.snapshotValue.restorePending = false;
        await this.ensureCatalog();
        await this.catalog!.flush();
        await this.refresh();
        const revisions = await this.repository.listRevisions();
        const jobs = await this.repository.jobs();
        const verified = new Set(
          jobs.filter((j) => j.state === "verified").map((j) => j.id)
        );
        const publishedDocuments = new Set(
          revisions
            .filter((r) => verified.has(r.id))
            .map((r) => r.commit.documentId)
        );
        const drafts = new Set<string>();
        const emptyDrafts = new Set<string>();
        for (const note of this.snapshotValue.notes) {
          const heads = note.view.heads.join(":");
          let cached = this.draftHeads.get(note.id);
          if (cached?.heads !== heads) {
            cached = {
              heads,
              draft: await isLocalDraft(this.repository, note.view),
            };
            this.draftHeads.set(note.id, cached);
          }
          if (cached!.draft) {
            emptyDrafts.add(note.id);
            if (!publishedDocuments.has(note.id)) drafts.add(note.id);
          }
        }
        const excluded = new Set(
          revisions
            .filter((r) => drafts.has(r.commit.documentId))
            .map((r) => r.id)
        );
        this.snapshotValue.localDrafts = jobs.filter(
          (j) => j.state !== "verified" && excluded.has(j.id)
        ).length;
        const publishStarted = Date.now();
        for (let batch = 0; batch < 5; batch++) {
          const published = await this.syncEngine.publish(100, excluded);
          this.session.assert();
          if (
            published < 100 ||
            Date.now() - publishStarted >= 5000 ||
            this.lastEdit > publishStarted
          )
            break;
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
        if (
          this.connection.driveLayoutVersion === 1 &&
          pending === excluded.size
        ) {
          await notesRequest("/api/notes/drive", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "organize",
              duplicateHashes: this.transport.duplicatePackHashes(),
            }),
            signal: this.session.signal,
          });
          for (const note of this.snapshotValue.notes) {
            if (this.lastEdit > publishStarted) break;
            if (!emptyDrafts.has(note.id))
              await this.publications.publish(
                note,
                this.snapshotValue.folders,
                {
                  documentId: this.catalogId,
                  heads: (await this.repository.document(this.catalogId)).heads,
                },
                true
              );
          }
        }
        this.snapshotValue.error = undefined;
        this.snapshotValue.errorCode = undefined;
        this.snapshotValue.cloudErrorSince = undefined;
        this.snapshotValue.backupDelayed = false;
        if (!pending) this.snapshotValue.verifiedAt = new Date().toISOString();
        this.lastCloud = Date.now();
        await this.refresh();
      } catch (error) {
        if (error instanceof TransportError) {
          if (error.code === "AUTH") this.needsReconnect = true;
          if (error.code === "THROTTLE")
            this.retryAfterAt = Date.now() + Math.max(1000, error.retryAfterMs);
          if (error.code === "NETWORK") this.retryAfterAt = Date.now() + 60_000;
        }
        this.snapshotValue.verifiedAt = undefined;
        this.setError(error);
        throw error;
      } finally {
        if (!this.closed) {
          this.lastCloud = Date.now();
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
    if (this.snapshotValue.errorCode !== "THROTTLE") this.retryAfterAt = 0;
    await this.repository.resumeBlockedJobs();
    return this.synchronize();
  }
  async refresh(initial = false): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const summaries: NoteSummary[] = [],
        old = new Map(this.snapshotValue.notes.map((n) => [n.id, n]));
      for (let offset = 0; ; offset += 200) {
        const rows = await this.repository.catalogPage(
          offset,
          initial ? 50 : 200
        );
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
        if (initial || rows.length < 200) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.session.assert();
      this.snapshotValue.notes = summaries;
      this.snapshotValue.catalogComplete = !initial;
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
      this.snapshotValue.memoryPending = this.unacknowledgedRecoveryCount();
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
    if (!initial && !this.active.size)
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
              ...textFragments(loaded.doc).map((fragment) =>
                loaded.doc
                  .getXmlFragment(fragment)
                  .toString()
                  .replace(/<[^>]*>/g, " ")
                  .replace(/\s+/g, " ")
              )
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
  preferences(): NotesPreferences {
    const parsed = notesPreferencesSchema.safeParse(
      this.catalog?.doc.getMap("preferences").get("notes")
    );
    return parsed.success ? parsed.data : notesPreferencesSchema.parse({});
  }
  async savePreferences(value: NotesPreferences) {
    if (
      !this.catalog ||
      ["failed", "closed", "pausing"].includes(this.catalog.status().state)
    )
      throw new NotesError(
        "CONFLICT",
        "Retry library saving before changing note defaults."
      );
    this.catalog.doc
      .getMap("preferences")
      .set("notes", notesPreferencesSchema.parse(value));
    await this.catalog.flush();
    await this.refresh();
  }
  async prepareCreativeTools(documentId: string) {
    const view = await this.repository.document(documentId);
    if (view.descriptor.requiredFeatures.includes("creative-tools-v1")) return;
    await this.mutate(documentId, (d) => {
      d.requiredFeatures = [
        ...new Set([...d.requiredFeatures, "creative-tools-v1"]),
      ];
    });
  }
  async create(
    title = "Untitled note",
    kind: "flow" | "notebook" = "flow",
    folderId: string | null = null,
    pageType: "typed" | "ink" = "typed",
    initialText = ""
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
    const style = this.preferences().style;
    descriptor.extensions.noteStyle = style;
    descriptor.requiredFeatures.push("creative-tools-v1");
    for (const page of descriptor.pages) {
      page.width = style.width;
      page.height = style.height;
      page.extensions.noteStyle = style;
    }
    if (pageType === "ink") {
      if (kind !== "notebook")
        throw new NotesError(
          "CONFLICT",
          "Handwriting requires a fixed notebook page."
        );
      descriptor.streams[0].adapter = INK_ADAPTER;
      descriptor.streams[0].projection = { root: "ink", type: "map" };
      descriptor.requiredFeatures = ["ink-v1", "paged-v1", "creative-tools-v1"];
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
              ? initialInkUpdate(style.paper)
              : await initialRichTextUpdate(initialText),
        },
      ],
    });
    await this.refresh();
    return documentId;
  }
  /** Additive page layers: original stream identities, revisions and bytes remain intact. */
  ensurePageLayers(documentId: string, pageId?: string): Promise<PageLayers> {
    const key = documentId + ":" + (pageId || "first");
    const pending = this.openingLayers.get(key);
    if (pending) return pending;
    const task = this.preparePageLayers(documentId, pageId).finally(() =>
      this.openingLayers.delete(key)
    );
    this.openingLayers.set(key, task);
    return task;
  }
  private async preparePageLayers(
    documentId: string,
    pageId?: string
  ): Promise<PageLayers> {
    const view = await this.repository.document(documentId);
    if (view.descriptor.kind === "pdf")
      throw new NotesError(
        "UNSUPPORTED",
        "PDF pages use their annotation editor."
      );
    const original = pageId
      ? view.descriptor.pages.find((p) => p.pageId === pageId)
      : view.descriptor.pages.find((p) => !p.extensions.archived);
    if ((pageId && !original) || original?.extensions.archived)
      throw new NotesError("NOT_FOUND", "Restore this page before editing.");
    const primary =
      view.descriptor.streams.find((s) => s.streamId === original?.streamId) ||
      view.descriptor.streams[0];
    if (
      !primary ||
      !["blocknote/0.56.0", INK_ADAPTER].includes(primary.adapter)
    )
      throw new NotesError(
        "UNSUPPORTED",
        "This page requires its original reader; its content is retained."
      );
    const id = original?.pageId || (await derivedId(documentId, "first-page"));
    const find = (adapter: string, key: string) =>
      view.descriptor.streams.find(
        (s) =>
          s.adapter === adapter &&
          (s.streamId === primary.streamId ||
            s.streamId === original?.extensions[key])
      );
    const text = find("blocknote/0.56.0", "textStreamId");
    const ink = find(INK_ADAPTER, "inkStreamId");
    if (original && text && ink) return { page: original, text, ink };
    const textId = text?.streamId || (await derivedId(id, "text-layer"));
    const inkId = ink?.streamId || (await derivedId(id, "ink-layer"));
    const additions = [
      ...(!text
        ? [
            {
              streamId: textId,
              adapter: "blocknote/0.56.0",
              root: "body",
              type: "xml" as const,
              bytes: await initialRichTextUpdate(),
            },
          ]
        : []),
      ...(!ink
        ? [
            {
              streamId: inkId,
              adapter: INK_ADAPTER,
              root: "ink",
              type: "map" as const,
              bytes: initialInkUpdate(
                readNoteStyle(
                  original?.extensions.noteStyle ||
                    view.descriptor.extensions.noteStyle
                ).paper
              ),
            },
          ]
        : []),
    ];
    await this.mutate(
      documentId,
      (d) => {
        let page = d.pages.find((p) => p.pageId === id);
        if (!page) {
          page = {
            pageId: id,
            streamId: primary.streamId,
            width: readNoteStyle(d.extensions.noteStyle).width,
            height: readNoteStyle(d.extensions.noteStyle).height,
            extensions: { noteStyle: readNoteStyle(d.extensions.noteStyle) },
          };
          d.pages.push(page);
        }
        for (const layer of additions)
          if (!d.streams.some((s) => s.streamId === layer.streamId))
            d.streams.push({
              streamId: layer.streamId,
              epoch: 1,
              codec: "yjs13-update-v1",
              adapter: layer.adapter,
              schemaVersion: 1,
              projection: { root: layer.root, type: layer.type },
            });
        page.extensions.textStreamId = textId;
        page.extensions.inkStreamId = inkId;
        d.requiredFeatures = [
          ...new Set([
            ...d.requiredFeatures,
            "rich-text-v1",
            "ink-v1",
            "page-layers-v1",
            "paged-v1",
          ]),
        ];
      },
      "edit",
      additions.map((s) => ({ streamId: s.streamId, epoch: 1, bytes: s.bytes }))
    );
    const latest = (await this.repository.document(documentId)).descriptor;
    return {
      page: latest.pages.find((p) => p.pageId === id)!,
      text: latest.streams.find((s) => s.streamId === textId)!,
      ink: latest.streams.find((s) => s.streamId === inkId)!,
    };
  }
  open(documentId: string, pageId?: string, layer?: "text" | "ink") {
    return this.serializeDocument(documentId, () =>
      this.openStream(documentId, pageId, layer)
    );
  }
  private async openStream(
    documentId: string,
    pageId?: string,
    layer?: "text" | "ink"
  ) {
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
    const layerId =
      layer &&
      page?.extensions[layer === "text" ? "textStreamId" : "inkStreamId"];
    const definition =
      descriptor.streams.find(
        (s) => s.streamId === (layerId || page?.streamId)
      ) || descriptor.streams[0];
    if (
      !definition ||
      (layer &&
        definition.adapter !==
          (layer === "text" ? "blocknote/0.56.0" : INK_ADAPTER)) ||
      !["blocknote/0.56.0", INK_ADAPTER, PDF_ADAPTER].includes(
        definition.adapter
      )
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
      if (state === "saving") this.lastEdit = Date.now();
      if (state === "failed" || this.snapshotValue.memoryPending)
        this.updateRecovery();
    });
    return {
      stream,
      release: () => {
        const close = () => {
          unlisten();
          this.active.delete(stream);
          stream.close();
        };
        const write = this.documentWrites.get(documentId);
        if (write) void write.catch(() => {}).finally(close);
        else close();
      },
    };
  }
  mutate(
    documentId: string,
    change: (descriptor: DocumentDescriptor) => void,
    kind: "edit" | "restore" | "tombstone" = "edit",
    updates: import("./contracts").SaveRequest["updates"] = []
  ) {
    return this.serializeDocument(documentId, () =>
      this.applyMutation(documentId, change, kind, updates)
    );
  }
  private async applyMutation(
    documentId: string,
    change: (descriptor: DocumentDescriptor) => void,
    kind: "edit" | "restore" | "tombstone",
    updates: import("./contracts").SaveRequest["updates"]
  ) {
    const streams = [...this.active].filter(
      (s) => s.documentId === documentId && s.status().state !== "closed"
    );
    const releaseHolds = streams.map((s) => s.hold());
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
      if (descriptor.title !== view.descriptor.title)
        descriptor.extensions.sylfTitleSet = true;
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor,
        kind,
        updates,
      });
      if (kind === "tombstone") streams.forEach((s) => s.close());
      else await Promise.all(streams.map((s) => s.acceptMetadata()));
      await this.refresh();
    } finally {
      releaseHolds.forEach((release) => release());
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
      extensions: {
        ...page.extensions,
        ...Object.fromEntries(
          ["textStreamId", "inkStreamId"].flatMap((key) =>
            typeof page.extensions[key] === "string" &&
            streamIds.has(page.extensions[key] as string)
              ? [[key, streamIds.get(page.extensions[key] as string)!]]
              : []
          )
        ),
      },
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
  async importPdf(
    bytes: Uint8Array,
    pages: PdfSourcePage[],
    name: string,
    folderId: string | null = null,
    targetId?: string,
    afterPageId?: string
  ) {
    this.session.assert();
    if (!this.snapshotValue.ready)
      throw new NotesError(
        "CONFLICT",
        "Restore and verify the library before importing a PDF."
      );
    if (
      bytes.length > PDF_LIMITS.fileBytes ||
      !new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-")
    )
      throw new NotesError("LIMIT", "Choose a valid PDF up to 50 MiB.");
    const source = z
      .array(pdfSourcePageSchema)
      .min(1)
      .max(PDF_LIMITS.importedPages)
      .parse(pages);
    const asset = await this.repository.stageAsset(
      bytes,
      "application/pdf",
      name.slice(0, 500)
    );
    const documentId = targetId || newId();
    const updates: NonNullable<import("./contracts").SaveRequest["updates"]> =
      [];
    const append = (d: DocumentDescriptor) => {
      if (d.kind !== "pdf")
        throw new NotesError(
          "CONFLICT",
          "Insert PDF pages into a PDF study document."
        );
      if (d.pages.length + source.length > PDF_LIMITS.documentPages)
        throw new NotesError(
          "LIMIT",
          "This study document supports up to 1,000 retained pages."
        );
      if (!d.assets.some((a) => a.assetId === asset.assetId))
        d.assets.push(asset);
      if (
        d.assets.reduce((n, a) => n + a.content.size, 0) >
        PDF_LIMITS.exportSourceBytes
      )
        throw new NotesError(
          "LIMIT",
          "This study document exceeds its 128 MiB source budget. Import as a separate document."
        );
      const inserted = source.map((p, i) => {
        const streamId = newId();
        updates.push({ streamId, epoch: 1, bytes: initialPdfUpdate() });
        d.streams.push({
          streamId,
          epoch: 1,
          codec: "yjs13-update-v1",
          adapter: PDF_ADAPTER,
          schemaVersion: 1,
          projection: { root: "pdf", type: "map" },
        });
        return {
          pageId: newId(),
          streamId,
          width: p.width,
          height: p.height,
          originalAssetId: asset.assetId,
          sourcePage: i,
          extensions: {
            pdfTransform: p.transform,
            pdfSourceRotation: p.rotation,
            pdfRotation: 0,
          },
        };
      });
      const index = afterPageId
        ? d.pages.findIndex((p) => p.pageId === afterPageId)
        : -1;
      if (afterPageId && index < 0)
        throw new NotesError(
          "NOT_FOUND",
          "The insertion page is unavailable; the imported source is retained in Recovery."
        );
      d.pages.splice(index < 0 ? d.pages.length : index + 1, 0, ...inserted);
      d.requiredFeatures = [
        ...new Set([
          ...d.requiredFeatures,
          "pdf-v1",
          "ink-v1",
          "attachments-v1",
          "paged-v1",
        ]),
      ];
    };
    if (targetId) await this.mutate(targetId, append, "edit", updates);
    else {
      const d = this.descriptor(
        documentId,
        newId(),
        name
          .replace(/\.pdf$/i, "")
          .trim()
          .slice(0, 500) || "Imported PDF",
        "notebook"
      );
      d.kind = "pdf";
      d.pages = [];
      d.streams = [];
      d.requiredFeatures = [];
      d.folderId = folderId;
      append(d);
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: [],
        kind: "create",
        descriptor: d,
        updates,
      });
      await this.refresh();
    }
    return documentId;
  }
  addPage(documentId: string, copyPageId?: string, afterPageId?: string) {
    return this.serializeDocument(documentId, () =>
      this.appendPage(documentId, copyPageId, afterPageId)
    );
  }
  private async appendPage(
    documentId: string,
    copyPageId?: string,
    afterPageId?: string
  ) {
    const streams = [...this.active].filter(
      (s) => s.documentId === documentId && s.status().state !== "closed"
    );
    const releaseHolds = streams.map((s) => s.hold());
    try {
      await Promise.all(streams.map((s) => s.flush()));
      const view = await this.repository.document(documentId),
        descriptor = structuredClone(view.descriptor),
        streamId = newId(),
        pageId = newId();
      if (
        !["flow", "notebook", "pdf"].includes(descriptor.kind) ||
        view.state !== "active"
      )
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
      const pdf = descriptor.kind === "pdf";
      const ink = pdf || sourceStream.adapter === INK_ADAPTER;
      if (pdf && descriptor.pages.length >= PDF_LIMITS.documentPages)
        throw new NotesError(
          "LIMIT",
          "This document has reached its retained-page limit."
        );
      descriptor.streams.push({
        streamId,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: pdf ? PDF_ADAPTER : ink ? INK_ADAPTER : "blocknote/0.56.0",
        schemaVersion: 1,
        projection: pdf
          ? { root: "pdf", type: "map" }
          : ink
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
      const normalStyle = readNoteStyle(
        descriptor.pages.find((p) => p.pageId === afterPageId)?.extensions
          .noteStyle ||
          descriptor.pages.filter((p) => !p.extensions.archived).at(-1)
            ?.extensions.noteStyle ||
          descriptor.extensions.noteStyle ||
          this.preferences().style
      );
      const reference = pdf
          ? descriptor.pages.find((p) => p.pageId === afterPageId)
          : undefined,
        blankSize = reference ? displayedPageSize(reference) : normalStyle;
      const page: DocumentDescriptor["pages"][number] = {
        pageId,
        streamId,
        width: sourcePage?.width || blankSize.width,
        height: sourcePage?.height || blankSize.height,
        ...(sourcePage?.originalAssetId
          ? {
              originalAssetId: sourcePage.originalAssetId,
              sourcePage: sourcePage.sourcePage,
            }
          : {}),
        extensions: sourcePage
          ? { ...sourcePage.extensions, archived: false }
          : pdf
            ? {}
            : { noteStyle: normalStyle },
      };
      const insertion = afterPageId
        ? descriptor.pages.findIndex((p) => p.pageId === afterPageId)
        : -1;
      if (afterPageId && insertion < 0)
        throw new NotesError("NOT_FOUND", "The insertion page is unavailable.");
      descriptor.pages.splice(
        insertion < 0 ? descriptor.pages.length : insertion + 1,
        0,
        page
      );
      let bytes = pdf
        ? initialPdfUpdate()
        : ink
          ? initialInkUpdate(normalStyle.paper)
          : await initialRichTextUpdate();
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
      const updates = [{ streamId, epoch: 1, bytes }];
      if (sourcePage && !pdf)
        for (const key of ["textStreamId", "inkStreamId"] as const) {
          const oldId = sourcePage.extensions[key];
          if (oldId === sourceStream.streamId) {
            page.extensions[key] = streamId;
            continue;
          }
          const companion = descriptor.streams.find(
            (s) => s.streamId === oldId
          );
          if (!companion) continue;
          const nextId = newId();
          const loaded = await this.repository.loadStream(
            documentId,
            companion.streamId,
            companion.epoch,
            view.heads
          );
          try {
            updates.push({
              streamId: nextId,
              epoch: 1,
              bytes: Y.encodeStateAsUpdate(loaded.doc),
            });
          } finally {
            loaded.doc.destroy();
          }
          descriptor.streams.push({
            ...companion,
            streamId: nextId,
            epoch: 1,
            predecessor: {
              streamId: companion.streamId,
              epoch: companion.epoch,
              heads: view.heads,
            },
          });
          page.extensions[key] = nextId;
        }
      await this.repository.save({
        operationId: newId(),
        documentId,
        parents: view.heads,
        descriptor,
        updates,
      });
      await Promise.all(streams.map((s) => s.acceptMetadata()));
      await this.refresh();
      return pageId;
    } finally {
      releaseHolds.forEach((release) => release());
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
  async setNoteStyle(
    documentId: string,
    style: NoteStyle,
    options: {
      pageId?: string;
      scope?: "page" | "all";
      contentBottom?: number;
    } = {}
  ): Promise<void> {
    const scope = options.scope ?? (options.pageId ? "page" : "all");
    const view = await this.repository.document(documentId);
    const targetPages =
      scope === "all"
        ? view.descriptor.pages.filter((p) => !p.extensions.archived)
        : view.descriptor.pages.filter((p) => p.pageId === options.pageId);

    const pageContentBottoms = new Map<string, number>();

    for (const page of targetPages) {
      const inkStreamId =
        (page.extensions.inkStreamId as string) || page.streamId;
      let doc: Y.Doc | undefined;
      let createdDoc = false;
      try {
        const activeStream = [...this.active].find(
          (s) => s.documentId === documentId && s.streamId === inkStreamId
        );
        if (activeStream) {
          doc = activeStream.doc;
        } else {
          const streamMeta = view.descriptor.streams.find(
            (s) => s.streamId === inkStreamId && s.adapter === INK_ADAPTER
          );
          if (streamMeta) {
            const loaded = await this.repository.loadStream(
              documentId,
              inkStreamId,
              streamMeta.epoch,
              view.heads
            );
            doc = loaded.doc;
            createdDoc = true;
          }
        }
        if (doc) {
          const ink = new InkModel(doc);
          if (page.width > style.width) {
            const right = Math.max(
              0,
              ...ink.strokes().map((s) => s.bounds.x + s.bounds.width)
            );
            if (style.width < right) {
              throw new NotesError(
                "LIMIT",
                "This size would crop handwriting. Move or resize the ink first, or choose a wider page."
              );
            }
          }
          const bottom = Math.max(
            0,
            ...ink.strokes().map((s) => s.bounds.y + s.bounds.height)
          );
          if (bottom > 0) {
            pageContentBottoms.set(page.pageId, bottom);
          }
          if (activeStream) {
            ink.setPaper(style.paper);
          }
        }
      } finally {
        if (createdDoc && doc) doc.destroy();
      }
    }

    await this.mutate(documentId, (d) => {
      if (scope === "all" || d.pages.length <= 1) {
        d.extensions.noteStyle = style;
      }
      if (!d.requiredFeatures.includes("creative-tools-v1")) {
        d.requiredFeatures.push("creative-tools-v1");
      }
      for (const page of d.pages) {
        if (scope === "all" || page.pageId === options.pageId) {
          page.width = style.width;
          const knownBottom = pageContentBottoms.get(page.pageId) || 0;
          if (
            page.pageId === options.pageId &&
            options.contentBottom !== undefined
          ) {
            page.height = Math.max(
              style.height,
              options.contentBottom,
              knownBottom
            );
          } else if (knownBottom > 0) {
            page.height = Math.max(style.height, knownBottom);
          } else {
            const prevTemplateHeight = readNoteStyle(
              page.extensions.noteStyle || d.extensions.noteStyle
            ).height;
            page.height =
              page.height <= prevTemplateHeight
                ? style.height
                : Math.max(style.height, page.height);
          }
          page.extensions.noteStyle = style;
        }
      }
    });
  }
  async editContent(
    documentId: string,
    selections: ContentSelection[],
    edit: ContentEdit
  ) {
    const ids = new Set(selections.map((s) => s.pageId));
    if (edit.type === "move" || edit.type === "copy")
      ids.add(edit.targetPageId);
    if (ids.size > 24)
      throw new NotesError("LIMIT", "Arrange up to 24 pages at a time.");
    for (const id of ids) await this.ensurePageLayers(documentId, id);
    return this.serializeDocument(documentId, async () => {
      const streams = [...this.active].filter(
        (s) => s.documentId === documentId && s.status().state !== "closed"
      );
      const releaseHolds = streams.map((s) => s.hold());
      const loaded: Y.Doc[] = [];
      try {
        await Promise.all(streams.map((s) => s.flush()));
        const view = await this.repository.document(documentId);
        const pages = new Map<string, ContentPage>();
        const entries: {
          doc: Y.Doc;
          vector: Uint8Array;
          streamId: string;
          epoch: number;
        }[] = [];
        for (const id of ids) {
          const page = structuredClone(
            view.descriptor.pages.find((p) => p.pageId === id)!
          );
          if (!page || page.extensions.archived)
            throw new NotesError(
              "NOT_FOUND",
              "A selected page is unavailable."
            );
          const docs: Y.Doc[] = [];
          for (const key of ["textStreamId", "inkStreamId"] as const) {
            const definition = view.descriptor.streams.find(
              (s) => s.streamId === page.extensions[key]
            )!;
            const { doc } = await this.repository.loadStream(
              documentId,
              definition.streamId,
              definition.epoch,
              view.heads
            );
            loaded.push(doc);
            docs.push(doc);
            entries.push({
              doc,
              vector: Y.encodeStateVector(doc),
              streamId: definition.streamId,
              epoch: definition.epoch,
            });
          }
          pages.set(id, { page, text: docs[0], ink: docs[1] });
        }
        editPageContent(pages, selections, edit);
        await this.applyMutation(
          documentId,
          (descriptor) => {
            for (const p of descriptor.pages)
              if (pages.has(p.pageId))
                p.height = Math.max(p.height, pages.get(p.pageId)!.page.height);
          },
          "edit",
          entries.map((e) => ({
            streamId: e.streamId,
            epoch: e.epoch,
            bytes: Y.encodeStateAsUpdate(e.doc, e.vector),
          }))
        );
      } finally {
        loaded.forEach((doc) => doc.destroy());
        releaseHolds.forEach((release) => release());
      }
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
  private async stageImage(file: File) {
    if (
      !/^image\/(png|jpeg|webp|gif)$/.test(file.type) ||
      file.size > 16 * 1024 * 1024
    )
      throw new NotesError(
        "LIMIT",
        "Choose a PNG, JPEG, WebP or GIF image up to 16 MiB."
      );
    return this.repository.stageAsset(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
      file.name
    );
  }
  async importImage(file: File, folderId: string | null = null) {
    if (!this.snapshotValue.ready)
      throw new NotesError(
        "CONFLICT",
        "Restore and verify the library before importing documents."
      );
    const asset = await this.stageImage(file),
      documentId = newId(),
      streamId = newId();
    const descriptor = this.descriptor(
      documentId,
      streamId,
      file.name.replace(/\.[^.]+$/, "").slice(0, 500) || "Imported image",
      "notebook"
    );
    descriptor.folderId = folderId;
    const style = this.preferences().style;
    descriptor.extensions.noteStyle = style;
    descriptor.requiredFeatures.push("creative-tools-v1");
    for (const page of descriptor.pages) {
      page.width = style.width;
      page.height = style.height;
      page.extensions.noteStyle = style;
    }

    descriptor.assets.push(asset);
    descriptor.requiredFeatures.push("attachments-v1");
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
          bytes: await initialRichTextUpdate("", {
            url: `sylf-asset:${asset.assetId}`,
            name: file.name,
          }),
        },
      ],
    });
    await this.refresh();
    return documentId;
  }
  async uploadImage(documentId: string, file: File) {
    const asset = await this.stageImage(file);
    await this.mutate(documentId, (descriptor) => {
      if (!descriptor.assets.some((a) => a.assetId === asset.assetId))
        descriptor.assets.push(asset);
    });
    return `sylf-asset:${asset.assetId}`;
  }
  /** Decoded image URLs belong to one mounted editor, never to a library lifetime. */
  imageResolver(documentId: string) {
    this.session.assert();
    const urls = new Map<string, string>(),
      pending = new Map<string, Promise<string>>();
    let closed = false;
    const assert = () => {
      this.session.assert();
      if (closed || this.closed)
        throw new NotesError("SESSION_ENDED", "This image view is closed.");
    };
    const close = () => {
      if (closed) return;
      closed = true;
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      pending.clear();
      this.imageResolvers.delete(close);
    };
    this.imageResolvers.add(close);
    return {
      close,
      resolve: async (url: string): Promise<string> => {
        assert();
        if (!/^sylf-asset:[a-f0-9]{64}$/.test(url))
          throw new NotesError(
            "UNSUPPORTED",
            "Upload images into Notes instead of loading external image URLs."
          );
        const cached = urls.get(url);
        if (cached) return cached;
        const prior = pending.get(url);
        if (prior) return prior;
        const task = (async () => {
          const descriptor = (await this.repository.document(documentId))
              .descriptor,
            asset = descriptor.assets.find(
              (a) => `sylf-asset:${a.assetId}` === url
            );
          if (!asset)
            throw new NotesError(
              "CORRUPT",
              "This image reference needs recovery."
            );
          const bytes = await this.repository.readContent(asset.content);
          assert();
          const objectURL = URL.createObjectURL(
            new Blob([bytes.slice().buffer], { type: asset.mediaType })
          );
          urls.set(url, objectURL);
          return objectURL;
        })();
        pending.set(url, task);
        try {
          return await task;
        } finally {
          if (pending.get(url) === task) pending.delete(url);
        }
      },
    };
  }
  async saveResume(documentId: string, position: NotesResumePosition) {
    this.session.assert();
    if (!this.catalog && this.catalogStartup) await this.catalogStartup;
    // Optional view positions must not block leaving a safely restored note
    // while its organization stream is still downloading. Keep prior positions.
    if (!this.catalog && !this.snapshotValue.ready) return;
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
    if (
      typeof document !== "undefined" &&
      typeof document.removeEventListener === "function"
    )
      document.removeEventListener("visibilitychange", this.visibility);
    this.unlisten();
    this.unlistenRecovery();
    for (const remove of this.beforeCloseDisposers.values()) remove();
    this.beforeCloseDisposers.clear();
    this.beforeClose.clear();
    this.unlistenCatalog?.();
    this.catalog?.close();
    for (const stream of this.active) stream.close();
    this.active.clear();
    for (const close of this.imageResolvers) close();
    this.imageResolvers.clear();
    this.indexedHeads.clear();
    this.draftHeads.clear();
    this.publications.clear();
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

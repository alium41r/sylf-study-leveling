import * as Y from "yjs";
import { newId, type ObjectRef } from "./contracts";
import { NotesError } from "./errors";
import type { NotesRepository } from "./repository";
import { registerNotesFlush, registerNotesRecoveryCheck } from "./session";

export type SaveState =
  | "ready"
  | "saving"
  | "pausing"
  | "local-durable"
  | "failed"
  | "closed";
interface Pending {
  operationId: string;
  bytes: Uint8Array;
}
interface RecoveryCapsule {
  ownerId: string;
  libraryId: string;
  generation: number;
  documentId: string;
  streamId: string;
  epoch: number;
  heads: string[];
  descriptor: ObjectRef;
  pending: Pending[];
}
// Unacknowledged memory is retained across editor/session teardown, never exposed to another owner.
// It still cannot survive process loss. Acknowledged work lives in the repository, not this map.
const recovery = new Map<string, RecoveryCapsule>();
const recoveryListeners = new Set<
  (ownerId: string, libraryId: string) => void
>();
const notifyRecovery = (ownerId: string, libraryId: string) => {
  for (const listener of recoveryListeners) {
    try {
      listener(ownerId, libraryId);
    } catch {
      /* Observers cannot discard recovery bytes. */
    }
  }
};
export function observeNotesRecovery(
  listener: (ownerId: string, libraryId: string) => void
) {
  recoveryListeners.add(listener);
  return () => {
    recoveryListeners.delete(listener);
  };
}
export function retainedNotesRecovery(repository: NotesRepository) {
  repository.session.assert();
  return [...recovery.values()]
    .filter(
      (c) =>
        c.ownerId === repository.session.ownerId &&
        c.libraryId === repository.libraryId &&
        c.pending.length
    )
    .map((c) => ({
      documentId: c.documentId,
      streamId: c.streamId,
      epoch: c.epoch,
      heads: [...c.heads],
      descriptor: { ...c.descriptor },
      bytes: Y.mergeUpdates(c.pending.map((p) => p.bytes)),
    }));
}
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", (event) => {
    if ([...recovery.values()].some((c) => c.pending.length)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
registerNotesRecoveryCheck((ownerId) =>
  [...recovery.values()].some(
    (c) => c.ownerId === ownerId && c.pending.length > 0
  )
);

export async function recoverUnacknowledged(
  repository: NotesRepository
): Promise<number> {
  const { binding } = await repository.library();
  let count = 0;
  for (const [id, capsule] of recovery) {
    if (
      capsule.ownerId !== repository.session.ownerId ||
      capsule.libraryId !== repository.libraryId
    )
      continue;
    repository.session.assert();
    if (capsule.generation !== binding.generation)
      throw new NotesError(
        "CONFLICT",
        "Unacknowledged work belongs to the original cloud binding; preserve it for explicit recovery."
      );
    while (capsule.pending.length) {
      const pending = capsule.pending[0];
      const receipt = await repository.save({
        operationId: pending.operationId,
        documentId: capsule.documentId,
        parents: capsule.heads,
        descriptor: capsule.descriptor,
        updates: [
          {
            streamId: capsule.streamId,
            epoch: capsule.epoch,
            bytes: pending.bytes,
          },
        ],
      });
      capsule.heads = [receipt.revisionId];
      capsule.pending.shift();
      count++;
    }
    recovery.delete(id);
    notifyRecovery(capsule.ownerId, capsule.libraryId);
  }
  return count;
}

/** Shared imperative binding. No React, cloud, Next, SQL or UI dependencies. */
export class NotesStream {
  private readonly ydoc: Y.Doc;
  private state: SaveState = "ready";
  private pending: Pending[] = [];
  private buffer: Uint8Array[] = [];
  private chain = Promise.resolve();
  private heads: string[];
  private readonly listeners = new Set<(state: SaveState) => void>();
  private readonly removeRepository: () => void;
  private readonly removeClose: () => void;
  private readonly removeFlush: () => void;
  private descriptorRef: ObjectRef;
  private failure?: unknown;
  private pausing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private poll?: ReturnType<typeof setInterval>;
  private refreshing?: Promise<void>;
  private activityVersion = 0;
  private readonly inputBoundaries = new Set<() => void>();
  private readonly remoteOrigin = Symbol("notes-repository");
  private readonly navigationGuard = (event: BeforeUnloadEvent) => {
    if (this.state !== "closed") this.captureInput();
    if (
      this.state !== "closed" &&
      (this.pending.length || this.buffer.length)
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  private constructor(
    private readonly repository: NotesRepository,
    readonly documentId: string,
    readonly streamId: string,
    readonly epoch: number,
    doc: Y.Doc,
    heads: string[],
    descriptorRef: ObjectRef,
    private readonly generation: number,
    readonly adapterId: string
  ) {
    this.ydoc = doc;
    this.heads = heads;
    this.descriptorRef = descriptorRef;
    doc.on("update", this.capture);
    this.removeRepository = repository.subscribe(() => {
      if (this.state !== "closed")
        void this.refresh().catch((error) => this.fail(error));
    });
    this.removeClose = repository.session.onClose(() => this.close());
    let resumeAfterCancelledLogout = false;
    this.removeFlush = registerNotesFlush(
      repository.session.ownerId,
      async () => {
        resumeAfterCancelledLogout = !this.pausing;
        this.pausing = true;
        this.setState("pausing");
        try {
          await this.flush();
        } catch (error) {
          this.fail(error);
          throw error;
        }
      },
      () => {
        if (resumeAfterCancelledLogout) this.resume();
        resumeAfterCancelledLogout = false;
      }
    );
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.navigationGuard);
      this.poll = setInterval(() => {
        void this.refresh().catch((error) => this.fail(error));
      }, 2000);
    }
  }
  get doc(): Y.Doc {
    this.repository.session.assert();
    if (this.state === "closed")
      throw new NotesError("SESSION_ENDED", "Stream is closed.");
    return this.ydoc;
  }
  static async open(
    repository: NotesRepository,
    documentId: string,
    streamId: string,
    epoch: number,
    options: { deferRecovery?: boolean } = {}
  ): Promise<NotesStream> {
    // The library catalog can open acknowledged state to expose emergency
    // recovery UI when replay itself fails on quota. Editors keep eager replay.
    if (!options.deferRecovery) await recoverUnacknowledged(repository);
    const view = await repository.document(documentId),
      { binding } = await repository.library();
    if (
      view.state !== "active" ||
      view.descriptor.requiredFeatures.some(
        (f) =>
          !["rich-text-v1", "paged-v1", "attachments-v1", "ink-v1"].includes(f)
      )
    )
      throw new NotesError(
        "CONFLICT",
        "This document requires restoration, conflict review or a compatible reader."
      );
    if (
      !view.descriptor.streams.some(
        (s) =>
          s.streamId === streamId &&
          s.epoch === epoch &&
          s.codec === "yjs13-update-v1"
      )
    )
      throw new NotesError(
        "UNSUPPORTED",
        "The requested stream requires a compatible reader or explicit epoch selection."
      );
    const loaded = await repository.loadStream(
      documentId,
      streamId,
      epoch,
      view.heads
    );
    return new NotesStream(
      repository,
      documentId,
      streamId,
      epoch,
      loaded.doc,
      view.heads,
      view.descriptorRef,
      binding.generation,
      view.descriptor.streams.find(
        (s) => s.streamId === streamId && s.epoch === epoch
      )!.adapter
    );
  }
  private setState(state: SaveState): void {
    this.state = state;
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        /* Observers cannot change durability. */
      }
    }
  }
  status(): { state: SaveState; pending: number; error?: unknown } {
    return {
      state: this.state,
      pending: this.pending.length + this.buffer.length,
      error: this.failure,
    };
  }
  subscribe(listener: (state: SaveState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private freezeBuffer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.buffer.length) {
      this.pending.push({
        operationId: newId(),
        bytes: Y.mergeUpdates(this.buffer),
      });
      this.buffer = [];
    }
  }
  private capture = (bytes: Uint8Array, origin: unknown): void => {
    if (origin === this.remoteOrigin || this.state === "closed") return;
    this.activityVersion++;
    this.buffer.push(bytes.slice());
    if (this.failure) return;
    this.setState(this.pausing ? "pausing" : "saving");
    if (!this.timer) this.timer = setTimeout(() => this.enqueue(), 20);
  };
  private enqueue(): void {
    this.freezeBuffer();
    if (!this.failure)
      this.chain = this.chain
        .then(() => this.drain())
        .catch((error) => this.fail(error));
  }
  private fail(error: unknown): void {
    if (this.state !== "closed") {
      this.failure = error;
      this.setState("failed");
    }
  }
  private async drain(): Promise<void> {
    while (this.pending.length) {
      this.repository.session.assert();
      const item = this.pending[0];
      const receipt = await this.repository.save({
        operationId: item.operationId,
        documentId: this.documentId,
        parents: this.heads,
        descriptor: this.descriptorRef,
        updates: [
          { streamId: this.streamId, epoch: this.epoch, bytes: item.bytes },
        ],
      });
      this.heads = [receipt.revisionId];
      this.pending.shift();
    }
    if (this.state !== "closed") {
      this.failure = undefined;
      this.setState(
        this.pausing
          ? "pausing"
          : this.buffer.length
            ? "saving"
            : "local-durable"
      );
    }
  }
  async flush(): Promise<void> {
    this.captureInput();
    do {
      this.enqueue();
      await this.chain;
      if (this.failure) throw this.failure;
    } while (this.pending.length || this.buffer.length);
    this.repository.session.assert();
  }
  async retry(): Promise<void> {
    if (this.state === "closed")
      throw new NotesError("SESSION_ENDED", "Stream is closed.");
    this.failure = undefined;
    this.pausing = false;
    await this.flush();
  }
  pause(): void {
    this.repository.session.assert();
    if (this.state === "closed")
      throw new NotesError("SESSION_ENDED", "Stream is closed.");
    this.captureInput();
    this.pausing = true;
    if (!this.failure) this.setState("pausing");
  }
  resume(): void {
    if (this.state === "closed") return;
    this.pausing = false;
    this.setState(
      this.failure
        ? "failed"
        : this.pending.length || this.buffer.length
          ? "saving"
          : "local-durable"
    );
  }
  /** Explicitly accept a repository metadata mutation after the caller paused and drained this stream. */
  async acceptMetadata(): Promise<void> {
    this.repository.session.assert();
    if (
      !this.pausing ||
      this.pending.length ||
      this.buffer.length ||
      this.failure
    )
      throw new NotesError(
        "CONFLICT",
        "Drain and pause the editor before accepting metadata."
      );
    const activity = this.activityVersion;
    const stable = () =>
      this.state !== "closed" &&
      this.pausing &&
      !this.pending.length &&
      !this.buffer.length &&
      !this.failure &&
      activity === this.activityVersion;
    const requireStable = () => {
      if (!stable()) {
        const error = new NotesError(
          "CONFLICT",
          "Pending changes arrived during metadata adoption. Preserve/retry them before reopening."
        );
        this.fail(error);
        throw error;
      }
    };
    const view = await this.repository.document(this.documentId);
    requireStable();
    if (
      view.state !== "active" ||
      !view.descriptor.streams.some(
        (s) =>
          s.streamId === this.streamId &&
          s.epoch === this.epoch &&
          s.adapter === this.adapterId
      )
    )
      throw new NotesError(
        "CONFLICT",
        "Reopen this document after its lifecycle change."
      );
    const loaded = await this.repository.loadStream(
      this.documentId,
      this.streamId,
      this.epoch,
      view.heads
    );
    try {
      this.repository.session.assert();
      requireStable();
      Y.applyUpdate(
        this.ydoc,
        Y.encodeStateAsUpdate(loaded.doc),
        this.remoteOrigin
      );
      this.heads = view.heads;
      this.descriptorRef = view.descriptorRef;
      this.activityVersion++;
    } finally {
      loaded.doc.destroy();
    }
  }
  /** Explicit emergency recovery; these bytes are not claimed to be durable. */
  unsavedUpdates(): Uint8Array[] {
    this.repository.session.assert();
    return [
      ...this.pending.map((p) => p.bytes.slice()),
      ...this.buffer.map((b) => b.slice()),
    ];
  }
  recoverySnapshot() {
    this.repository.session.assert();
    if (this.state === "closed")
      throw new NotesError(
        "SESSION_ENDED",
        "Reopen the original owner before exporting recovery data."
      );
    return {
      documentId: this.documentId,
      streamId: this.streamId,
      epoch: this.epoch,
      heads: [...this.heads],
      descriptor: { ...this.descriptorRef },
      bytes: Y.mergeUpdates([
        ...this.pending.map((p) => p.bytes),
        ...this.buffer,
      ]),
    };
  }
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      await this.chain;
      if (
        this.state === "closed" ||
        this.pausing ||
        this.pending.length ||
        this.buffer.length ||
        this.failure
      )
        return;
      const activity = this.activityVersion;
      const unchanged = () =>
        this.state !== "closed" &&
        !this.pausing &&
        !this.failure &&
        !this.pending.length &&
        !this.buffer.length &&
        activity === this.activityVersion;
      const view = await this.repository.document(this.documentId);
      if (!unchanged()) return;
      if (
        view.state !== "active" ||
        view.descriptorRef.hash !== this.descriptorRef.hash
      ) {
        this.fail(
          new NotesError(
            "CONFLICT",
            "Metadata or deletion changed; reopen/recover before further editing."
          )
        );
        return;
      }
      const loaded = await this.repository.loadStream(
        this.documentId,
        this.streamId,
        this.epoch,
        view.heads
      );
      try {
        this.repository.session.assert();
        // A local save can finish while this asynchronous replay is loading.
        // Never replace its newer frontier with the earlier read's heads.
        if (!unchanged()) return;
        Y.applyUpdate(
          this.ydoc,
          Y.encodeStateAsUpdate(loaded.doc),
          this.remoteOrigin
        );
        this.heads = view.heads;
      } finally {
        loaded.doc.destroy();
      }
    })().finally(() => {
      this.refreshing = undefined;
    });
    return this.refreshing;
  }
  close(): void {
    if (this.state === "closed") return;
    this.captureInput();
    this.inputBoundaries.clear();
    this.freezeBuffer();
    if (this.pending.length) {
      recovery.set(newId(), {
        ownerId: this.repository.session.ownerId,
        libraryId: this.repository.libraryId,
        generation: this.generation,
        documentId: this.documentId,
        streamId: this.streamId,
        epoch: this.epoch,
        heads: [...this.heads],
        descriptor: this.descriptorRef,
        pending: this.pending.map((p) => ({
          operationId: p.operationId,
          bytes: p.bytes.slice(),
        })),
      });
      notifyRecovery(
        this.repository.session.ownerId,
        this.repository.libraryId
      );
    }
    this.ydoc.off("update", this.capture);
    this.ydoc.destroy();
    this.removeRepository?.();
    this.removeClose?.();
    this.removeFlush?.();
    if (this.poll) clearInterval(this.poll);
    if (typeof window !== "undefined")
      window.removeEventListener("beforeunload", this.navigationGuard);
    this.setState("closed");
    this.listeners.clear();
  }
  /** Capture already observed pointer samples before flush, pause or revocation. */
  registerInputBoundary(callback: () => void) {
    this.inputBoundaries.add(callback);
    return () => {
      this.inputBoundaries.delete(callback);
    };
  }
  private captureInput() {
    for (const callback of this.inputBoundaries) callback();
  }
}

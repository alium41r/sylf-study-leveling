// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import * as Y from "yjs";
import { zipSync } from "fflate";
import {
  newId,
  type DocumentDescriptor,
  type SaveRequest,
  type CloudBinding,
  type LibraryDescriptor,
} from "@/lib/notes/contracts";
import { digest, encodeJson } from "@/lib/notes/bytes";
import {
  IndexedDbNotesRepository,
  type FaultPoint,
} from "@/lib/notes/repository";
import { NotesSession, prepareNotesLogout } from "@/lib/notes/session";
import { NotesStream, recoverUnacknowledged } from "@/lib/notes/engine";
import {
  exportNotes,
  importNotes,
  inspectNotesArchive,
  readStoredZip,
} from "@/lib/notes/portable";
import {
  NotesSynchronizer,
  TransportError,
  type NotesTransport,
} from "@/lib/notes/sync";
import { projectFolderMoves } from "@/lib/notes/graph";
import { NotesError } from "@/lib/notes/errors";

const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
function fixtureIdentity(owner = "1", libraryId = newId()) {
  const descriptor: LibraryDescriptor = {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId,
    ownerRef: owner,
    bindingGeneration: 1,
    extensions: {},
  };
  const binding: CloudBinding = {
    provider: "google-drive",
    accountId: "synthetic-account",
    rootId: "synthetic-root",
    generation: 1,
    verifiedAt: new Date(0).toISOString(),
    probeHash: "0".repeat(64),
  };
  return { descriptor, binding };
}
async function setup(
  options: {
    owner?: string;
    name?: string;
    identity?: ReturnType<typeof fixtureIdentity>;
    fault?: (point: FaultPoint) => void;
  } = {}
) {
  const name = options.name ?? "notes-test-" + newId(),
    owner = { value: options.owner ?? "1" },
    identity = options.identity ?? fixtureIdentity(owner.value);
  const session = new NotesSession(owner.value, () => owner.value || null);
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId: identity.descriptor.libraryId,
    bindingGeneration: 1,
    databaseName: name,
    fault: options.fault,
  });
  cleanup.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  await repo.registerLibrary(identity.descriptor, identity.binding);
  return { name, owner, session, repo, identity };
}
function descriptor(libraryId: string, title = "Test"): DocumentDescriptor {
  return {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId,
    documentId: newId(),
    kind: "flow",
    title,
    schemaVersion: 1,
    streams: [
      {
        streamId: newId(),
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "plain-text-test",
        schemaVersion: 1,
        projection: { root: "text", type: "text" },
      },
    ],
    pages: [],
    assets: [],
    folderId: null,
    subjectId: null,
    requiredFeatures: [],
    extensions: {},
  };
}
async function seed(
  repo: IndexedDbNotesRepository,
  text = "initial",
  doc = descriptor(repo.libraryId)
) {
  const ydoc = new Y.Doc();
  ydoc.getText("text").insert(0, text);
  const request: SaveRequest = {
    operationId: newId(),
    documentId: doc.documentId,
    parents: [],
    descriptor: doc,
    kind: "create",
    updates: [
      {
        streamId: doc.streams[0].streamId,
        epoch: 1,
        bytes: Y.encodeStateAsUpdate(ydoc),
      },
    ],
  };
  const receipt = await repo.save(request);
  ydoc.destroy();
  return { doc, request, receipt };
}
async function append(
  repo: IndexedDbNotesRepository,
  doc: DocumentDescriptor,
  text: string,
  parents?: string[]
) {
  const view = await repo.document(doc.documentId),
    stream = doc.streams[0];
  const loaded = await repo.loadStream(
    doc.documentId,
    stream.streamId,
    stream.epoch,
    parents ?? view.heads
  );
  const bytes: Uint8Array[] = [];
  loaded.doc.on("update", (update) => bytes.push(update));
  loaded.doc.getText("text").insert(loaded.doc.getText("text").length, text);
  const request: SaveRequest = {
    operationId: newId(),
    documentId: doc.documentId,
    parents: parents ?? view.heads,
    descriptor: view.descriptorRef,
    updates: [
      {
        streamId: stream.streamId,
        epoch: stream.epoch,
        bytes: Y.mergeUpdates(bytes),
      },
    ],
  };
  loaded.doc.destroy();
  return { request, receipt: await repo.save(request) };
}
async function text(
  repo: IndexedDbNotesRepository,
  doc: DocumentDescriptor,
  at?: string[]
) {
  const loaded = await repo.loadStream(
    doc.documentId,
    doc.streams[0].streamId,
    doc.streams[0].epoch,
    at
  );
  try {
    return loaded.doc.getText("text").toString();
  } finally {
    loaded.doc.destroy();
  }
}
async function raw(name: string) {
  const db = new Dexie(name);
  await db.open();
  cleanup.push(() => db.close());
  return db;
}

class FakeTransport implements NotesTransport {
  readonly objects = new Map<string, Uint8Array>();
  writes = 0;
  lostResponse = false;
  corrupt = false;
  missing?: string;
  expireCursor = false;
  beforeCreate?: () => void;
  constructor(readonly scope: NotesTransport["scope"]) {}
  async candidates(hash: string) {
    if (hash === this.missing) return [];
    const bytes = this.objects.get(hash);
    return bytes ? [this.corrupt ? new Uint8Array([1, 2]) : bytes.slice()] : [];
  }
  async create(hash: string, bytes: Uint8Array) {
    this.beforeCreate?.();
    if (!this.objects.has(hash)) {
      this.objects.set(hash, bytes.slice());
      this.writes++;
    }
    if (this.lostResponse) {
      this.lostResponse = false;
      throw new TransportError("NETWORK");
    }
  }
  async enumerate(cursor: string | undefined) {
    if (cursor && this.expireCursor) {
      this.expireCursor = false;
      throw new TransportError("CURSOR_EXPIRED");
    }
    const revisionIds = [...this.objects]
      .filter(([, bytes]) => {
        try {
          return (
            JSON.parse(new TextDecoder().decode(bytes)).format ===
            "sylf-notes-commit"
          );
        } catch {
          return false;
        }
      })
      .map(([hash]) => hash);
    return { revisionIds, cursor: "cursor-" + this.objects.size, more: false };
  }
}
function target(ctx: Awaited<ReturnType<typeof setup>>) {
  return new FakeTransport({
    ownerId: ctx.session.ownerId,
    libraryId: ctx.repo.libraryId,
    bindingGeneration: 1,
    provider: ctx.identity.binding.provider,
    accountId: ctx.identity.binding.accountId,
    rootId: ctx.identity.binding.rootId,
  });
}

describe("durable repository", () => {
  it("atomically stores journal, outbox and identity; survives a fresh connection", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo);
    expect(receipt.state).toBe("local-durable");
    expect((await ctx.repo.jobs())[0].state).toBe("pending");
    ctx.repo.close();
    const reopened = await setup({ name: ctx.name, identity: ctx.identity });
    expect(await text(reopened.repo, doc)).toBe("initial");
    expect((await reopened.repo.listRevisions()).map((r) => r.id)).toEqual([
      receipt.revisionId,
    ]);
  });
  for (const point of [
    "before-write",
    "after-objects",
    "after-journal",
    "after-outbox",
    "before-commit",
  ] as FaultPoint[]) {
    it("rolls back every save component after " + point, async () => {
      let fail = false;
      const ctx = await setup({
        fault: (p) => {
          if (fail && p === point) throw new Error("power interruption");
        },
      });
      const { doc } = await seed(ctx.repo);
      const before = await ctx.repo.storageStats();
      fail = true;
      await expect(
        append(ctx.repo, doc, "not acknowledged")
      ).rejects.toMatchObject({ code: "STORAGE" });
      fail = false;
      expect(await ctx.repo.storageStats()).toEqual(before);
      expect(await text(ctx.repo, doc)).toBe("initial");
    });
  }
  it("reports uncertain acknowledgement and retries the identical operation once", async () => {
    let fail = false;
    const ctx = await setup({
      fault: (p) => {
        if (fail && p === "after-commit") throw new Error("response lost");
      },
    });
    const { doc } = await seed(ctx.repo);
    const view = await ctx.repo.document(doc.documentId),
      loaded = await ctx.repo.loadStream(
        doc.documentId,
        doc.streams[0].streamId,
        1
      );
    loaded.doc.getText("text").insert(0, "kept ");
    const request: SaveRequest = {
      operationId: newId(),
      documentId: doc.documentId,
      descriptor: view.descriptorRef,
      parents: view.heads,
      updates: [
        {
          streamId: doc.streams[0].streamId,
          epoch: 1,
          bytes: Y.encodeStateAsUpdate(loaded.doc),
        },
      ],
    };
    loaded.doc.destroy();
    fail = true;
    await expect(ctx.repo.save(request)).rejects.toMatchObject({
      code: "ACK_UNCERTAIN",
    });
    fail = false;
    const one = await ctx.repo.save(request),
      two = await ctx.repo.save(request);
    expect(one.revisionId).toBe(two.revisionId);
    expect((await ctx.repo.jobs()).length).toBe(2);
    expect(await text(ctx.repo, doc)).toBe("kept initial");
    await expect(
      ctx.repo.save({ ...request, kind: "tombstone", updates: [] })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("quota failure cannot acknowledge a partial save or discard previous content", async () => {
    let fail = false;
    const ctx = await setup({
      fault: (p) => {
        if (fail && p === "after-journal")
          throw new DOMException("full", "QuotaExceededError");
      },
    });
    const { doc } = await seed(ctx.repo);
    fail = true;
    await expect(append(ctx.repo, doc, "x")).rejects.toMatchObject({
      code: "QUOTA",
    });
    fail = false;
    expect(await text(ctx.repo, doc)).toBe("initial");
    expect((await ctx.repo.jobs()).length).toBe(1);
  });
  it("never turns missing or malformed streams into a writable empty document", async () => {
    const ctx = await setup();
    await expect(
      ctx.repo.loadStream(newId(), newId(), 1)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { doc } = await seed(ctx.repo);
    await expect(
      ctx.repo.loadStream(doc.documentId, newId(), 1)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const view = await ctx.repo.document(doc.documentId);
    await expect(
      ctx.repo.save({
        operationId: newId(),
        documentId: doc.documentId,
        parents: view.heads,
        descriptor: view.descriptorRef,
        updates: [
          {
            streamId: doc.streams[0].streamId,
            epoch: 1,
            bytes: new Uint8Array([1]),
          },
        ],
      })
    ).rejects.toMatchObject({ code: "CORRUPT" });
  });
  it("stages chunked originals atomically, deduplicates bytes and retains interrupted stages", async () => {
    const ctx = await setup(),
      input = new Uint8Array(8 * 1024 * 1024 + 13);
    input[0] = 7;
    input[input.length - 1] = 9;
    const asset = await ctx.repo.stageAsset(
      input,
      "application/pdf",
      "original.pdf"
    );
    expect(asset.content.parts.length).toBe(3);
    const before = await ctx.repo.storageStats();
    await ctx.repo.stageAsset(input, "application/pdf", "same.pdf");
    expect((await ctx.repo.storageStats()).objects).toBe(before.objects);
    ctx.repo.close();
    const reopened = await setup({ name: ctx.name, identity: ctx.identity });
    expect((await reopened.repo.pendingAssets()).length).toBe(1);
    const doc = descriptor(ctx.repo.libraryId);
    doc.assets = [asset];
    await seed(reopened.repo, "with original", doc);
    expect(await digest(await reopened.repo.readContent(asset.content))).toBe(
      await digest(input)
    );
    expect(await reopened.repo.pendingAssets()).toEqual([]);
  });
  it("detects corrupt bytes, exposes a healthy ancestor, and explicitly repairs while retaining damaged bytes", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo);
    const edited = await append(ctx.repo, doc, " edited");
    const revision = (await ctx.repo.listRevisions()).find(
      (r) => r.id === edited.receipt.revisionId
    )!;
    const ref = revision.commit.updates[0].content.parts[0],
      good = await ctx.repo.readObject(ref.hash),
      db = await raw(ctx.name);
    await db.table("objects").put({
      scope: ctx.repo.scope,
      hash: ref.hash,
      bytes: new Uint8Array([0]),
    });
    await expect(text(ctx.repo, doc)).rejects.toMatchObject({
      code: "CORRUPT",
    });
    const health = await ctx.repo.inspectIntegrity();
    expect(health.issues.length).toBe(1);
    expect(health.recoverableHeads[doc.documentId]).toEqual([
      receipt.revisionId,
    ]);
    expect(await text(ctx.repo, doc, [receipt.revisionId])).toBe("initial");
    await ctx.repo.repairObject(ref.hash, good);
    expect(await text(ctx.repo, doc)).toBe("initial edited");
    expect(await db.table("quarantine").count()).toBe(1);
  });
  it("rebuilds deleted derived catalog and missing queue receipts without deleting source", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      db = await raw(ctx.name);
    await db.table("documents").clear();
    await db.table("outbox").clear();
    expect(await ctx.repo.listDocumentIds()).toEqual([]);
    await ctx.repo.rebuildCatalog();
    expect(await ctx.repo.listDocumentIds()).toEqual([doc.documentId]);
    expect((await ctx.repo.jobs())[0].state).toBe("pending");
    expect(await text(ctx.repo, doc)).toBe("initial");
  });
  it("checkpoints preserve native lineage and all history; old devices still merge", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo);
    const fork = await ctx.repo.loadStream(
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    await append(ctx.repo, doc, " A");
    await ctx.repo.checkpoint(doc.documentId, doc.streams[0].streamId, 1);
    const bytes: Uint8Array[] = [];
    fork.doc.on("update", (b) => bytes.push(b));
    fork.doc.getText("text").insert(0, "B ");
    fork.doc.destroy();
    await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: [receipt.revisionId],
      descriptor: (await ctx.repo.document(doc.documentId)).descriptorRef,
      updates: [
        {
          streamId: doc.streams[0].streamId,
          epoch: 1,
          bytes: Y.mergeUpdates(bytes),
        },
      ],
    });
    expect(await text(ctx.repo, doc)).toBe("B initial A");
    expect((await ctx.repo.listRevisions()).length).toBe(4);
  });
  it("keeps concurrent tab branches and idempotent repeated updates", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo),
      other = await setup({ name: ctx.name, identity: ctx.identity });
    await Promise.all([
      append(ctx.repo, doc, " A", [receipt.revisionId]),
      append(other.repo, doc, " B", [receipt.revisionId]),
    ]);
    const result = await text(ctx.repo, doc);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect((await ctx.repo.document(doc.documentId)).heads.length).toBe(2);
  });
  it("retains a deletion concurrent with an offline edit and requires explicit causal restore", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo);
    const view = await ctx.repo.document(doc.documentId);
    const deleted = await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: view.heads,
      descriptor: view.descriptorRef,
      kind: "tombstone",
    });
    await expect(
      append(ctx.repo, doc, "known deletion", [deleted.revisionId])
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await append(ctx.repo, doc, " offline", [receipt.revisionId]);
    expect((await ctx.repo.document(doc.documentId)).state).toBe("conflict");
    expect(await text(ctx.repo, doc)).toBe("initial offline");
    const latest = await ctx.repo.document(doc.documentId);
    await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: latest.heads,
      descriptor: latest.descriptorRef,
      kind: "restore",
    });
    expect((await ctx.repo.document(doc.documentId)).state).toBe("active");
  });
  it("handles account switching during an in-flight transaction without a false acknowledgement", async () => {
    let switchOwner = false;
    const ownerBox: { owner?: { value: string } } = {};
    const ctx = await setup({
      fault: (point) => {
        if (switchOwner && point === "after-journal")
          ownerBox.owner!.value = "2";
      },
    });
    ownerBox.owner = ctx.owner;
    const { doc } = await seed(ctx.repo);
    switchOwner = true;
    await expect(append(ctx.repo, doc, "private")).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
    const reopened = await setup({ name: ctx.name, identity: ctx.identity });
    expect(await text(reopened.repo, doc)).toBe("initial");
  });
  it("isolates reads, exports, imports and uploads between owners", async () => {
    const a = await setup(),
      { doc } = await seed(a.repo),
      hash = (await a.repo.listRevisions())[0].id;
    const b = await setup({
      name: a.name,
      owner: "2",
      identity: fixtureIdentity("2", a.repo.libraryId),
    });
    await expect(b.repo.readObject(hash)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(b.repo.document(doc.documentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const archive = await exportNotes(a.repo);
    await expect(importNotes(b.repo, archive.bytes)).rejects.toMatchObject({
      code: "OWNERSHIP",
    });
    await expect(
      new NotesSynchronizer(a.repo, target(b)).publish()
    ).rejects.toMatchObject({ code: "OWNERSHIP" });
    a.session.close();
    await expect(exportNotes(a.repo)).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
    expect((await b.repo.jobs()).length).toBe(0);
  });
  it("retains unacknowledged memory after teardown and recovers only for the reauthenticated owner", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      stream = await NotesStream.open(
        ctx.repo,
        doc.documentId,
        doc.streams[0].streamId,
        1
      );
    stream.doc.getText("text").insert(0, "unsaved ");
    ctx.session.close();
    expect(stream.status().state).toBe("closed");
    const other = await setup({
      name: ctx.name,
      owner: "2",
      identity: fixtureIdentity("2", ctx.repo.libraryId),
    });
    expect(await recoverUnacknowledged(other.repo)).toBe(0);
    const own = await setup({ name: ctx.name, identity: ctx.identity });
    expect(await recoverUnacknowledged(own.repo)).toBe(1);
    expect(await text(own.repo, doc)).toBe("unsaved initial");
  });
});

describe("portable archive and scaling", () => {
  it("preserves history, originals, identities and extensions in a fresh database", async () => {
    const ctx = await setup(),
      asset = await ctx.repo.stageAsset(
        new Uint8Array([0, 1, 255, 128]),
        "image/png",
        "source.png"
      ),
      doc = descriptor(ctx.repo.libraryId);
    doc.assets = [asset];
    doc.extensions = { futureOptional: { nested: [1, "Ω"] } };
    const seeded = await seed(ctx.repo, "日本語 اردو", doc);
    await append(ctx.repo, doc, " added");
    const exported = await exportNotes(ctx.repo),
      target = await setup({ identity: ctx.identity });
    const imported = await importNotes(target.repo, exported.bytes);
    expect(imported.state).toBe("imported");
    expect(await text(target.repo, doc)).toBe("日本語 اردو added");
    expect(
      (await target.repo.document(doc.documentId)).descriptor.extensions
    ).toEqual(doc.extensions);
    expect(await target.repo.readContent(asset.content)).toEqual(
      new Uint8Array([0, 1, 255, 128])
    );
    expect((await target.repo.listRevisions()).map((r) => r.id).sort()).toEqual(
      exported.revisionIds.sort()
    );
    expect(await text(target.repo, doc, [seeded.receipt.revisionId])).toBe(
      "日本語 اردو"
    );
    const again = await importNotes(target.repo, exported.bytes);
    expect(again.state).toBe("imported");
    expect((await target.repo.jobs()).length).toBe(2);
    await append(target.repo, doc, " imported branch");
    await append(ctx.repo, doc, " original branch");
    await importNotes(target.repo, (await exportNotes(ctx.repo)).bytes);
    const merged = await text(target.repo, doc);
    expect(merged).toContain("imported branch");
    expect(merged).toContain("original branch");
  });
  it("keeps unsupported future archives read-only and retains original bytes", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      exported = await exportNotes(ctx.repo),
      files = readStoredZip(exported.bytes);
    const manifest = JSON.parse(
      new TextDecoder().decode(files.get("manifest.json"))
    );
    manifest.formatVersion = 2;
    files.set("manifest.json", encodeJson(manifest));
    const future = zipSync(Object.fromEntries(files), { level: 0 }),
      before = await ctx.repo.storageStats();
    const inspected = await importNotes(ctx.repo, future);
    expect(inspected.state).toBe("read-only");
    if (inspected.state === "read-only")
      expect(inspected.original).toEqual(future);
    expect(await ctx.repo.storageStats()).toEqual(before);
    expect(await text(ctx.repo, doc)).toBe("initial");
  });
  it("rejects corrupted, undeclared, compressed and traversal archives before activation", async () => {
    const ctx = await setup();
    const bad = zipSync(
      { "../escape": new Uint8Array([1]), "manifest.json": encodeJson({}) },
      { level: 0 }
    );
    expect(() => readStoredZip(bad)).toThrow();
    const compressed = zipSync(
      { "manifest.json": new Uint8Array(10000) },
      { level: 9 }
    );
    expect(() => readStoredZip(compressed)).toThrow();
    const { doc } = await seed(ctx.repo),
      archive = await exportNotes(ctx.repo),
      corrupted = archive.bytes.slice();
    corrupted[100] ^= 1;
    await expect(importNotes(ctx.repo, corrupted)).rejects.toBeInstanceOf(
      NotesError
    );
    expect(await text(ctx.repo, doc)).toBe("initial");
    const inspected = await inspectNotesArchive(archive.bytes);
    expect(inspected.state).toBe("supported");
    if (inspected.state === "supported")
      expect(inspected.manifest.interchange.length).toBe(1);
  });
  it("does not grow by full-document rewrites for ordinary updates", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo, "x".repeat(256000));
    const before = await ctx.repo.storageStats();
    const stream = await NotesStream.open(
      ctx.repo,
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    for (let i = 0; i < 200; i++) {
      stream.doc.getText("text").insert(0, "a");
      await stream.flush();
    }
    stream.close();
    const after = await ctx.repo.storageStats();
    expect(after.revisions).toBe(201);
    expect(after.objectBytes - before.objectBytes).toBeLessThan(400000);
    expect((await text(ctx.repo, doc)).length).toBe(256200);
  }, 30000);
  it("persists a 300-page / 20,000-object notebook without hydrating other pages", async () => {
    const ctx = await setup(),
      doc = descriptor(ctx.repo.libraryId);
    doc.kind = "notebook";
    doc.streams = [];
    doc.pages = [];
    const updates: NonNullable<SaveRequest["updates"]> = [];
    for (let page = 0; page < 300; page++) {
      const streamId = newId();
      doc.streams.push({
        streamId,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "page-objects-v1",
        schemaVersion: 1,
        projection: { root: "objects", type: "array" },
      });
      doc.pages.push({
        pageId: newId(),
        streamId,
        width: 595,
        height: 842,
        extensions: {},
      });
      const ydoc = new Y.Doc();
      const count = page < 200 ? 67 : 66;
      ydoc.getArray("objects").insert(
        0,
        Array.from({ length: count }, (_, i) => ({
          id: page * 67 + i,
          points: [
            [0, 0, 0.5],
            [5, 5, 0.8],
          ],
        }))
      );
      updates.push({ streamId, epoch: 1, bytes: Y.encodeStateAsUpdate(ydoc) });
      ydoc.destroy();
    }
    await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: [],
      descriptor: doc,
      kind: "create",
      updates,
    });
    const first = await ctx.repo.loadStream(
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    expect(first.doc.getArray("objects").length).toBe(67);
    first.doc.destroy();
    const all = await ctx.repo.storageStats();
    expect(all.objectBytes).toBeLessThan(4000000);
    expect(
      (await ctx.repo.document(doc.documentId)).descriptor.pages.length
    ).toBe(300);
  }, 30000);
});

describe("provider-neutral conformance", () => {
  it("persists provider Retry-After across coordinator replacement without early retry", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    const remote = target(ctx),
      started = Date.now();
    remote.candidates = async () => {
      throw new TransportError("THROTTLE", 60000);
    };
    await expect(
      new NotesSynchronizer(ctx.repo, remote).publish()
    ).rejects.toMatchObject({ code: "THROTTLE" });
    const [job] = await ctx.repo.jobs();
    expect(job).toMatchObject({ state: "pending", error: "THROTTLE" });
    expect(job.nextAttemptAt).toBeGreaterThanOrEqual(started + 60000);
    expect(await new NotesSynchronizer(ctx.repo, remote).publish()).toBe(0);
    expect(remote.writes).toBe(0);
  });
  it("blocks an unavailable root without treating absence as deletion or acknowledging uploads", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      remote = target(ctx);
    remote.candidates = async () => {
      throw new TransportError("AUTH");
    };
    await expect(
      new NotesSynchronizer(ctx.repo, remote).publish()
    ).rejects.toMatchObject({ code: "AUTH" });
    expect((await ctx.repo.jobs())[0].state).toBe("blocked");
    expect((await ctx.repo.document(doc.documentId)).state).toBe("active");
    expect(await text(ctx.repo, doc)).toBe("initial");
  });
  it("selects verified bytes among duplicate physical provider candidates", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      remote = target(ctx);
    await new NotesSynchronizer(ctx.repo, remote).publish();
    const original = remote.candidates.bind(remote);
    remote.candidates = async (hash) => [
      new Uint8Array([9]),
      ...(await original(hash)),
      ...(await original(hash)),
    ];
    const fresh = await setup({ identity: ctx.identity });
    await new NotesSynchronizer(fresh.repo, remote).pull();
    expect(await text(fresh.repo, doc)).toBe("initial");
  });
  it("reconciles lost upload responses, verifies closure, and reconstructs a fresh device", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      remote = target(ctx);
    await append(ctx.repo, doc, " synced");
    remote.lostResponse = true;
    expect(await new NotesSynchronizer(ctx.repo, remote).publish()).toBe(2);
    expect((await ctx.repo.jobs()).every((j) => j.state === "verified")).toBe(
      true
    );
    const writes = remote.writes;
    expect(await new NotesSynchronizer(ctx.repo, remote).publish()).toBe(0);
    expect(remote.writes).toBe(writes);
    const fresh = await setup({ identity: ctx.identity });
    await new NotesSynchronizer(fresh.repo, remote).pull();
    expect(await text(fresh.repo, doc)).toBe("initial synced");
    expect((await fresh.repo.jobs()).every((j) => j.state === "verified")).toBe(
      true
    );
  });
  it("refuses false cloud success on corrupt readback", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    const remote = target(ctx);
    remote.corrupt = true;
    await expect(
      new NotesSynchronizer(ctx.repo, remote).publish()
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect((await ctx.repo.jobs())[0].state).toBe("pending");
  });
  it("never advances a cursor or partially installs a page with a missing dependency", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      remote = target(ctx);
    await new NotesSynchronizer(ctx.repo, remote).publish();
    const revision = (await ctx.repo.listRevisions())[0];
    remote.missing = revision.commit.updates[0].content.parts[0].hash;
    const fresh = await setup({ identity: ctx.identity });
    await expect(
      new NotesSynchronizer(fresh.repo, remote).pull()
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect(await fresh.repo.cursor("primary")).toBeUndefined();
    expect(await fresh.repo.listDocumentIds()).toEqual([]);
    expect(await text(ctx.repo, doc)).toBe("initial");
  });
  it("rejects stale lease acknowledgements and reclaims crashed workers", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    const one = await ctx.repo.claimJob(100, 10);
    expect(one).not.toBeNull();
    expect(await ctx.repo.claimJob(105, 10)).toBeNull();
    const two = await ctx.repo.claimJob(111, 10);
    expect(two?.leaseId).not.toBe(one?.leaseId);
    await expect(
      ctx.repo.settleJob(one!.id, one!.leaseId!, { verified: true })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await ctx.repo.jobs())[0].state).toBe("uploading");
  });
  it("stops an old owner's upload without acknowledging the next owner", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    const remote = target(ctx);
    remote.beforeCreate = () => {
      ctx.owner.value = "2";
    };
    await expect(
      new NotesSynchronizer(ctx.repo, remote).publish()
    ).rejects.toMatchObject({ code: "SESSION_ENDED" });
    const own = await setup({ name: ctx.name, identity: ctx.identity });
    expect((await own.repo.jobs()).some((j) => j.state !== "verified")).toBe(
      true
    );
  });
  it("preserves both disconnected device heads on fresh reconstruction and handles expired cursors", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      clone = await setup({ identity: ctx.identity });
    await importNotes(clone.repo, (await exportNotes(ctx.repo)).bytes);
    await append(ctx.repo, doc, " device-A");
    await append(clone.repo, doc, " device-B");
    const remote = target(ctx);
    await new NotesSynchronizer(ctx.repo, remote).publish();
    await new NotesSynchronizer(clone.repo, remote).publish();
    const fresh = await setup({ identity: ctx.identity }),
      sync = new NotesSynchronizer(fresh.repo, remote);
    await sync.pull();
    remote.expireCursor = true;
    await sync.pull();
    const result = await text(fresh.repo, doc);
    expect(result).toContain("device-A");
    expect(result).toContain("device-B");
    expect((await fresh.repo.document(doc.documentId)).heads.length).toBe(2);
  });
  it("repairs folder cycles deterministically and retains recoverable moves", () => {
    const moves = [
      {
        folderId: "a",
        parentId: "b",
        sequence: 1,
        writerId: "a",
        operationId: "a",
      },
      {
        folderId: "b",
        parentId: "a",
        sequence: 1,
        writerId: "b",
        operationId: "b",
      },
    ];
    expect(projectFolderMoves(moves)).toEqual(
      projectFolderMoves([...moves].reverse())
    );
    expect(projectFolderMoves(moves).recovered.length).toBe(1);
  });
});

describe("causal and checkpoint integrity", () => {
  it("rejects a syntactically valid update with missing Yjs causal history", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      before = await ctx.repo.storageStats(),
      alien = new Y.Doc();
    alien.getText("text").insert(0, "missing origin");
    const changes: Uint8Array[] = [];
    alien.on("update", (b) => changes.push(b));
    alien.getText("text").insert(1, "dependent");
    alien.destroy();
    const view = await ctx.repo.document(doc.documentId);
    await expect(
      ctx.repo.save({
        operationId: newId(),
        documentId: doc.documentId,
        descriptor: view.descriptorRef,
        parents: view.heads,
        updates: [
          { streamId: doc.streams[0].streamId, epoch: 1, bytes: changes[0] },
        ],
      })
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect(await ctx.repo.storageStats()).toEqual(before);
  });
  it("does not acknowledge an empty checkpoint that claims to cover existing text", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo),
      view = await ctx.repo.document(doc.documentId),
      empty = new Y.Doc();
    const bytes = Y.encodeStateAsUpdate(empty);
    empty.destroy();
    await expect(
      ctx.repo.save({
        operationId: newId(),
        documentId: doc.documentId,
        descriptor: view.descriptorRef,
        parents: view.heads,
        kind: "checkpoint",
        updates: [
          {
            streamId: doc.streams[0].streamId,
            epoch: 1,
            role: "checkpoint",
            bytes,
          },
        ],
      })
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect(await text(ctx.repo, doc)).toBe("initial");
    expect((await ctx.repo.listRevisions()).length).toBe(1);
  });
  it("rejects forged checkpoint coverage before importing any history or advancing a cursor", async () => {
    const ctx = await setup(),
      { doc } = await seed(ctx.repo);
    await ctx.repo.checkpoint(doc.documentId, doc.streams[0].streamId, 1);
    const revisions = await ctx.repo.listRevisions(),
      checkpoint = revisions.find((r) => r.commit.kind === "checkpoint")!,
      empty = new Y.Doc();
    const emptyBytes = Y.encodeStateAsUpdate(empty);
    empty.destroy();
    const hash = await digest(emptyBytes);
    const forged = structuredClone(checkpoint.commit);
    forged.updates[0].content = {
      hash,
      size: emptyBytes.length,
      parts: [{ hash, size: emptyBytes.length }],
    };
    const bytes = encodeJson(forged),
      id = await digest(bytes),
      objects = new Map(
        (await ctx.repo.closure(revisions.map((r) => r.id))).map((o) => [
          o.hash,
          o,
        ])
      );
    objects.set(hash, { hash, bytes: emptyBytes });
    objects.set(id, { hash: id, bytes });
    const fresh = await setup({ identity: ctx.identity });
    await expect(
      fresh.repo.installBatch(
        [...objects.values()],
        revisions
          .filter((r) => r.id !== checkpoint.id)
          .map((r) => r.id)
          .concat(id),
        "remote",
        { channel: "primary", value: "should-not-advance" }
      )
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect(await fresh.repo.listDocumentIds()).toEqual([]);
    expect(await fresh.repo.cursor("primary")).toBeUndefined();
  });
  it("preserves imported operation identities for idempotent retry", async () => {
    const ctx = await setup(),
      seeded = await seed(ctx.repo),
      fresh = await setup({ identity: ctx.identity });
    await importNotes(fresh.repo, (await exportNotes(ctx.repo)).bytes);
    expect((await fresh.repo.save(seeded.request)).revisionId).toBe(
      seeded.receipt.revisionId
    );
    expect((await fresh.repo.jobs()).length).toBe(1);
  });
  it("migrates into a new epoch without mutating or removing the original", async () => {
    const ctx = await setup(),
      { doc, receipt } = await seed(ctx.repo),
      migrated = structuredClone(doc),
      view = await ctx.repo.document(doc.documentId);
    migrated.streams[0].epoch = 2;
    migrated.streams[0].predecessor = {
      streamId: doc.streams[0].streamId,
      epoch: 1,
      heads: view.heads,
    };
    const ydoc = new Y.Doc();
    ydoc.getText("text").insert(0, "converted copy");
    const bytes = Y.encodeStateAsUpdate(ydoc);
    ydoc.destroy();
    await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: view.heads,
      descriptor: migrated,
      kind: "migrate",
      updates: [{ streamId: migrated.streams[0].streamId, epoch: 2, bytes }],
    });
    expect(await text(ctx.repo, doc, [receipt.revisionId])).toBe("initial");
    expect(await text(ctx.repo, migrated)).toBe("converted copy");
    await expect(
      ctx.repo.save({
        operationId: newId(),
        documentId: doc.documentId,
        parents: (await ctx.repo.document(doc.documentId)).heads,
        descriptor: doc,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rolls back interrupted asset staging and recovers blocked jobs explicitly", async () => {
    let fail = false;
    const ctx = await setup({
      fault: (point) => {
        if (fail && point === "after-objects")
          throw new Error("interrupted asset");
      },
    });
    await seed(ctx.repo);
    const before = await ctx.repo.storageStats();
    fail = true;
    await expect(
      ctx.repo.stageAsset(new Uint8Array([3, 4]), "image/png", "incomplete")
    ).rejects.toMatchObject({ code: "STORAGE" });
    fail = false;
    expect(await ctx.repo.storageStats()).toEqual(before);
    const job = await ctx.repo.claimJob();
    await ctx.repo.settleJob(job!.id, job!.leaseId!, {
      verified: false,
      code: "AUTH",
      blocked: true,
      retryAt: Date.now(),
    });
    expect((await ctx.repo.jobs())[0].state).toBe("blocked");
    await ctx.repo.resumeBlockedJobs();
    expect((await ctx.repo.jobs())[0].state).toBe("pending");
  });
});

it("recovers a lost journal from trusted source markers without interpreting asset JSON as a revision", async () => {
  const ctx = await setup(),
    { doc } = await seed(ctx.repo);
  await append(ctx.repo, doc, " retained");
  const original = (await ctx.repo.listRevisions())[0].commit;
  await ctx.repo.stageAsset(
    encodeJson({ ...original, documentId: newId(), operationId: newId() }),
    "application/json",
    "not-a-revision.json"
  );
  const db = await raw(ctx.name);
  await db.table("journal").clear();
  await db.table("documents").clear();
  await db.table("outbox").clear();
  await db.table("operations").clear();
  expect(
    (await ctx.repo.inspectIntegrity()).issues.filter(
      (i) => i.code === "JOURNAL_MISSING"
    )
  ).toHaveLength(2);
  expect(await ctx.repo.recoverLostJournal()).toBe(2);
  expect(await ctx.repo.listDocumentIds()).toEqual([doc.documentId]);
  expect(await text(ctx.repo, doc)).toBe("initial retained");
  expect((await ctx.repo.jobs()).every((j) => j.state === "pending")).toBe(
    true
  );
  expect((await ctx.repo.pendingAssets()).length).toBe(1);
});

it("pauses editing and drains edits captured during an asynchronous logout save", async () => {
  let lateEdit: (() => void) | undefined;
  const ctx = await setup({
    owner: newId(),
    fault: (point) => {
      if (point === "after-journal" && lateEdit) {
        const run = lateEdit;
        lateEdit = undefined;
        run();
      }
    },
  });
  const { doc } = await seed(ctx.repo);
  const stream = await NotesStream.open(
    ctx.repo,
    doc.documentId,
    doc.streams[0].streamId,
    1
  );
  cleanup.push(() => stream.close());
  const ydoc = stream.doc;
  ydoc.getText("text").insert(7, " first");
  lateEdit = () => ydoc.getText("text").insert(13, " late");
  const states: string[] = [];
  stream.subscribe((state) => states.push(state));
  await prepareNotesLogout(ctx.owner.value);
  expect(await text(ctx.repo, doc)).toBe("initial first late");
  expect(stream.status()).toMatchObject({ state: "pausing", pending: 0 });
  expect(states.every((state) => state === "pausing")).toBe(true);
});

it("refuses an unsupported stored library header without changing source bytes", async () => {
  const ctx = await setup();
  await seed(ctx.repo);
  const db = await raw(ctx.name);
  const row = (await db.table("libraries").toArray())[0];
  row.descriptor.formatVersion = 2;
  await db.table("libraries").put(row);
  await expect(ctx.repo.library()).rejects.toMatchObject({
    code: "UNSUPPORTED",
  });
  expect((await db.table("objects").count()) > 0).toBe(true);
});

it("keeps a failed stream in the failed state when logout cannot drain it, then retries without losing bytes", async () => {
  let fail = false;
  const ctx = await setup({
    owner: newId(),
    fault: (point) => {
      if (fail && point === "after-journal")
        throw new DOMException("synthetic full storage", "QuotaExceededError");
    },
  });
  const { doc } = await seed(ctx.repo);
  const stream = await NotesStream.open(
    ctx.repo,
    doc.documentId,
    doc.streams[0].streamId,
    1
  );
  cleanup.push(() => stream.close());
  fail = true;
  stream.doc.getText("text").insert(7, " retained");
  await expect(stream.flush()).rejects.toMatchObject({ code: "QUOTA" });
  await expect(prepareNotesLogout(ctx.owner.value)).rejects.toMatchObject({
    code: "QUOTA",
  });
  expect(stream.status().state).toBe("failed");
  expect(ctx.session.signal.aborted).toBe(false);
  fail = false;
  await stream.retry();
  expect(await text(ctx.repo, doc)).toBe("initial retained");
});

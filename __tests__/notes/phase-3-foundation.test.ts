// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import * as Y from "yjs";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import {
  NotesSession,
  prepareNotesLogout,
  registerNotesFlush,
} from "@/lib/notes/session";
import { createNotesVault } from "@/lib/notes/vault";
import {
  newId,
  type CloudBinding,
  type DocumentDescriptor,
  type LibraryDescriptor,
} from "@/lib/notes/contracts";
import {
  NotesStream,
  retainedNotesRecovery,
  recoverUnacknowledged,
} from "@/lib/notes/engine";
import {
  exportNotes,
  exportNotesRecovery,
  importNotes,
} from "@/lib/notes/portable";
import { encodePack, decodePack } from "@/lib/notes/pack";
import { exportLockedNotesDevice } from "@/lib/notes/device-recovery";
import {
  GoogleDriveTransport,
  notesRequest,
} from "@/lib/notes/drive-transport";
import { NotesSynchronizer } from "@/lib/notes/sync";
import { digest } from "@/lib/notes/bytes";
import { notesResourceId, notesResourceURL } from "@/lib/resources";
const disposers: (() => Promise<unknown> | void)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const fn of disposers.splice(0).reverse()) await fn();
});
async function setup(
  options: {
    name?: string;
    owner?: string;
    libraryId?: string;
    key?: Uint8Array;
    fault?: (point: string) => void;
  } = {}
) {
  const name = options.name || "notes-phase3-" + newId(),
    owner = options.owner || "1",
    libraryId = options.libraryId || newId(),
    session = new NotesSession(owner, () => owner),
    key = options.key || crypto.getRandomValues(new Uint8Array(32));
  const cipher = await createNotesVault(
    key.slice(),
    JSON.stringify([owner, libraryId]),
    session
  );
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
    cipher,
    fault: options.fault,
  });
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
  disposers.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  await repo.registerLibrary(descriptor, binding);
  return { repo, session, name, key, descriptor, binding };
}
async function seed(
  repo: IndexedDbNotesRepository,
  title = "Secret lecture title"
) {
  const documentId = newId(),
    streamId = newId(),
    doc = new Y.Doc();
  doc.getText("text").insert(0, "private-body-marker");
  const descriptor: DocumentDescriptor = {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId: repo.libraryId,
    documentId,
    kind: "flow",
    title,
    schemaVersion: 1,
    folderId: null,
    subjectId: null,
    streams: [
      {
        streamId,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "text-test",
        schemaVersion: 1,
        projection: { root: "text", type: "text" },
      },
    ],
    pages: [],
    assets: [],
    requiredFeatures: [],
    extensions: {},
  };
  try {
    await repo.save({
      operationId: newId(),
      documentId,
      parents: [],
      kind: "create",
      descriptor,
      updates: [{ streamId, epoch: 1, bytes: Y.encodeStateAsUpdate(doc) }],
    });
  } finally {
    doc.destroy();
  }
  return descriptor;
}
describe("encrypted production repository", () => {
  it("encrypts content, titles, staged filenames and catalog projections while preserving exact reads", async () => {
    const ctx = await setup(),
      doc = await seed(ctx.repo);
    const input = new TextEncoder().encode("original-attachment-marker");
    const asset = await ctx.repo.stageAsset(
      input,
      "image/png",
      "secret-filename-marker.png"
    );
    expect(
      new TextDecoder().decode(await ctx.repo.readContent(asset.content))
    ).toBe("original-attachment-marker");
    expect((await ctx.repo.pendingAssets())[0].name).toBe(
      "secret-filename-marker.png"
    );
    expect((await ctx.repo.catalogPage())[0].view.descriptor.title).toBe(
      doc.title
    );
    const raw = new Dexie(ctx.name);
    await raw.open();
    disposers.push(() => raw.close());
    const text = [];
    for (const table of raw.tables)
      for (const row of await table.toArray()) {
        text.push(JSON.stringify(row));
        for (const value of Object.values(row))
          if (value instanceof Uint8Array)
            text.push(new TextDecoder().decode(value));
      }
    expect(text.join(" ")).not.toMatch(
      /private-body-marker|Secret lecture title|secret-filename-marker|original-attachment-marker/
    );
    ctx.repo.close();
    ctx.session.close();
    const reopened = await setup({
      name: ctx.name,
      libraryId: ctx.repo.libraryId,
      key: ctx.key,
    });
    const loaded = await reopened.repo.loadStream(
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toBe("private-body-marker");
    loaded.doc.destroy();
  });
  it("cannot decrypt with another key or identity and rejects access after session close", async () => {
    const owner = new NotesSession("a", () => "a"),
      other = new NotesSession("b", () => "b"),
      key = crypto.getRandomValues(new Uint8Array(32));
    disposers.push(
      () => owner.close(),
      () => other.close()
    );
    const vault = await createNotesVault(key.slice(), "owner-a", owner),
      foreign = await createNotesVault(key.slice(), "owner-b", other),
      wrong = await createNotesVault(
        crypto.getRandomValues(new Uint8Array(32)),
        "owner-a",
        owner
      );
    const sealed = await vault.seal(new Uint8Array([1, 2]), "object");
    await expect(foreign.open(sealed, "object")).rejects.toMatchObject({
      code: "CORRUPT",
    });
    await expect(wrong.open(sealed, "object")).rejects.toMatchObject({
      code: "CORRUPT",
    });
    await expect(vault.open(sealed, "different-object")).rejects.toMatchObject({
      code: "CORRUPT",
    });
    owner.close();
    await expect(vault.open(sealed, "object")).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
  });
  it("retains an acknowledged encrypted base and exports unsaved memory without requiring a new save", async () => {
    let fail = false;
    const ctx = await setup({
        fault: (point) => {
          if (fail && point === "after-journal")
            throw new DOMException("full", "QuotaExceededError");
        },
      }),
      doc = await seed(ctx.repo);
    const stream = await NotesStream.open(
      ctx.repo,
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    disposers.push(() => stream.close());
    fail = true;
    stream.doc.getText("text").insert(19, " unsaved-recovery-marker");
    await expect(stream.flush()).rejects.toMatchObject({ code: "QUOTA" });
    const before = await ctx.repo.storageStats(),
      archive = await exportNotesRecovery(ctx.repo, stream.recoverySnapshot());
    expect(await ctx.repo.storageStats()).toEqual(before);
    const fresh = await setup({ libraryId: ctx.repo.libraryId });
    await importNotes(fresh.repo, archive);
    const loaded = await fresh.repo.loadStream(
      doc.documentId,
      doc.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toContain(
      "unsaved-recovery-marker"
    );
    loaded.doc.destroy();
    fail = false;
    await stream.retry();
  });
  it("exports XML formatting with removed undefined attributes without rewriting native updates", async () => {
    const ctx = await setup(),
      descriptor = await seed(ctx.repo),
      streamId = newId(),
      native = new Y.Doc(),
      element = new Y.XmlElement("paragraph"),
      text = new Y.XmlText();
    element.setAttribute("backgroundColor", undefined as unknown as string);
    text.insert(0, "readable formatting");
    element.insert(0, [text]);
    native.getXmlFragment("body").insert(0, [element]);
    descriptor.documentId = newId();
    descriptor.streams = [
      {
        streamId,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "blocknote/0.56.0",
        schemaVersion: 1,
        projection: { root: "body", type: "xml" },
      },
    ];
    await ctx.repo.save({
      operationId: newId(),
      documentId: descriptor.documentId,
      parents: [],
      kind: "create",
      descriptor,
      updates: [{ streamId, epoch: 1, bytes: Y.encodeStateAsUpdate(native) }],
    });
    native.destroy();
    const file = await exportNotes(ctx.repo),
      fresh = await setup({ libraryId: ctx.repo.libraryId });
    await importNotes(fresh.repo, file.bytes);
    const loaded = await fresh.repo.loadStream(
      descriptor.documentId,
      streamId,
      1
    );
    expect(loaded.doc.getXmlFragment("body").toString()).toContain(
      "readable formatting"
    );
    loaded.doc.destroy();
  });
  it("resumes safely drained editors when another logout participant rejects", async () => {
    const ctx = await setup({ owner: "cancel-owner" }),
      d = await seed(ctx.repo),
      stream = await NotesStream.open(
        ctx.repo,
        d.documentId,
        d.streams[0].streamId,
        1
      );
    disposers.push(() => stream.close());
    const remove = registerNotesFlush("cancel-owner", async () => {
      throw new Error("other participant failed");
    });
    disposers.push(remove);
    await expect(prepareNotesLogout("cancel-owner")).rejects.toThrow(
      "other participant failed"
    );
    expect(stream.status().state).toBe("local-durable");
    stream.doc.getText("text").insert(0, "after cancelled logout ");
    await stream.flush();
    expect(stream.status().pending).toBe(0);
  });
  it("does not roll back a newer local frontier when an asynchronous replay completes late", async () => {
    const ctx = await setup(),
      descriptor = await seed(ctx.repo);
    let blocked = false,
      entered!: () => void,
      release!: () => void;
    const loading = new Promise<void>((resolve) => (entered = resolve)),
      gate = new Promise<void>((resolve) => (release = resolve));
    const proxy = new Proxy(ctx.repo, {
      get(target, key) {
        if (key === "loadStream")
          return async (
            ...args: Parameters<IndexedDbNotesRepository["loadStream"]>
          ) => {
            const loaded = await target.loadStream(...args);
            if (blocked) {
              entered();
              await gate;
            }
            return loaded;
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const stream = await NotesStream.open(
      proxy,
      descriptor.documentId,
      descriptor.streams[0].streamId,
      1
    );
    disposers.push(() => stream.close());
    const previous = await ctx.repo.document(descriptor.documentId),
      remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(stream.doc));
    remote.getText("text").insert(remote.getText("text").length, " remote");
    const remoteUpdate = Y.encodeStateAsUpdate(
      remote,
      Y.encodeStateVector(stream.doc)
    );
    remote.destroy();
    blocked = true;
    await ctx.repo.save({
      operationId: newId(),
      documentId: descriptor.documentId,
      parents: previous.heads,
      descriptor,
      updates: [
        {
          streamId: descriptor.streams[0].streamId,
          epoch: 1,
          bytes: remoteUpdate,
        },
      ],
    });
    const refreshing = stream.refresh();
    await loading;
    stream.doc.getText("text").insert(0, "first local ");
    await stream.flush();
    blocked = false;
    release();
    await refreshing;
    stream.doc.getText("text").insert(0, "second local ");
    await stream.flush();
    const loaded = await ctx.repo.loadStream(
      descriptor.documentId,
      descriptor.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toContain(
      "second local first local private-body-marker"
    );
    expect(loaded.doc.getText("text").toString()).toContain(" remote");
    loaded.doc.destroy();
  });
  it("refreshes proof for the same account/root but refuses implicit rebinding", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    await ctx.repo.registerLibrary(ctx.descriptor, {
      ...ctx.binding,
      verifiedAt: new Date().toISOString(),
      probeHash: "1".repeat(64),
    });
    expect((await ctx.repo.library()).binding.probeHash).toBe("1".repeat(64));
    await expect(
      ctx.repo.registerLibrary(ctx.descriptor, {
        ...ctx.binding,
        rootId: "wrong-root",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("opens an unchanged enrolled scope for recovery when refreshing proof metadata hits quota", async () => {
    const ctx = await setup();
    await seed(ctx.repo);
    const original = IDBObjectStore.prototype.put,
      spy = vi
        .spyOn(IDBObjectStore.prototype, "put")
        .mockImplementation(function (
          this: IDBObjectStore,
          ...args: Parameters<IDBObjectStore["put"]>
        ) {
          if (this.name === "libraries")
            throw new DOMException("metadata full", "QuotaExceededError");
          return original.apply(this, args);
        });
    try {
      await ctx.repo.registerLibrary(ctx.descriptor, {
        ...ctx.binding,
        verifiedAt: new Date().toISOString(),
        probeHash: "1".repeat(64),
      });
      expect((await ctx.repo.library()).binding.probeHash).toBe(
        ctx.binding.probeHash
      );
    } finally {
      spy.mockRestore();
    }
  });
  it("repairs only a damaged header using the original scoped descriptor and retains the damaged copy", async () => {
    const ctx = await setup(),
      doc = await seed(ctx.repo);
    const raw = new Dexie(ctx.name);
    await raw.open();
    disposers.push(() => raw.close());
    const header = (await raw.table("libraries").toArray())[0];
    header.descriptor.ownerRef = "";
    await raw.table("libraries").put(header);
    await expect(ctx.repo.library()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    await expect(
      ctx.repo.repairLibraryHeader(
        { ...ctx.descriptor, ownerRef: "other" },
        ctx.binding
      )
    ).rejects.toMatchObject({ code: "OWNERSHIP" });
    await ctx.repo.repairLibraryHeader(ctx.descriptor, ctx.binding);
    expect((await ctx.repo.document(doc.documentId)).descriptor.title).toBe(
      doc.title
    );
    expect(await raw.table("quarantine").count()).toBe(1);
    await expect(
      ctx.repo.repairLibraryHeader(ctx.descriptor, ctx.binding)
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("never downgrades a newer device library header during recovery", async () => {
    const ctx = await setup(),
      raw = new Dexie(ctx.name);
    await raw.open();
    disposers.push(() => raw.close());
    const row = (await raw.table("libraries").toArray())[0];
    row.descriptor.formatVersion = 2;
    await raw.table("libraries").put(row);
    await expect(
      ctx.repo.repairLibraryHeader(ctx.descriptor, ctx.binding)
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
    expect(
      (await raw.table("libraries").toArray())[0].descriptor.formatVersion
    ).toBe(2);
  });
  it("preserves encrypted raw records despite a damaged header and refuses a foreign cookie owner", async () => {
    const libraryId = newId(),
      ctx = await setup({
        libraryId,
        name: `sylf-notes-vault-v1:1:${libraryId}`,
      });
    await seed(ctx.repo);
    const raw = new Dexie(ctx.name);
    await raw.open();
    disposers.push(() => raw.close());
    const row = (await raw.table("libraries").toArray())[0];
    row.descriptor.ownerRef = "";
    await raw.table("libraries").put(row);
    const barrier = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => barrier.get(k) ?? null,
        setItem: (k: string, v: string) => barrier.set(k, v),
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("fetch", async () =>
      Response.json({
        connection: { descriptor: { ownerRef: "1", libraryId } },
      })
    );
    const bytes = await exportLockedNotesDevice("1", libraryId, () => true),
      text = new TextDecoder().decode(bytes),
      parsed = JSON.parse(text);
    expect(parsed.format).toBe("sylf-device-recovery");
    expect(
      parsed.records.some((r: { table: string }) => r.table === "objects")
    ).toBe(true);
    expect(text).not.toMatch(/private-body-marker|Secret lecture title/);
    expect(
      parsed.records.find((r: { table: string }) => r.table === "libraries").row
        .descriptor.ownerRef
    ).toBe("");
    vi.stubGlobal("fetch", async () =>
      Response.json({
        connection: { descriptor: { ownerRef: "2", libraryId } },
      })
    );
    await expect(
      exportLockedNotesDevice("1", libraryId, () => true)
    ).rejects.toMatchObject({ code: "OWNERSHIP" });
  });
  it("rebuilds a corrupted derived catalog without changing native source", async () => {
    const ctx = await setup(),
      doc = await seed(ctx.repo);
    await ctx.repo.catalogPage();
    const raw = new Dexie(ctx.name);
    await raw.open();
    disposers.push(() => raw.close());
    const row = (await raw.table("documents").toArray())[0];
    row.catalog.bytes[5] ^= 1;
    await raw.table("documents").put(row);
    ctx.repo.close();
    const reopened = await setup({
      name: ctx.name,
      libraryId: ctx.repo.libraryId,
      key: ctx.key,
    });
    expect((await reopened.repo.catalogPage())[0].view.descriptor.title).toBe(
      doc.title
    );
  });
});
describe("cloud batch and resource contracts", () => {
  it("round-trips portable logical object bytes in a bounded provider-readable pack", async () => {
    const libraryId = newId(),
      bytes = new TextEncoder().encode("exact bytes Ω"),
      hash = await digest(bytes),
      pack = await encodePack(libraryId, [{ hash, bytes }], []),
      parsed = await decodePack(pack, libraryId);
    expect(parsed.objects.get(hash)).toEqual(bytes);
    await expect(decodePack(pack, newId())).rejects.toMatchObject({
      code: "CORRUPT",
    });
    const changed = pack.slice();
    changed[changed.length - 1] ^= 1;
    await expect(decodePack(changed, libraryId)).rejects.toMatchObject({
      code: "CORRUPT",
    });
    await expect(
      decodePack(pack.slice(0, -1), libraryId)
    ).rejects.toMatchObject({ code: "CORRUPT" });
  });
  it("rejects duplicate objects and undeclared revision bytes", async () => {
    const libraryId = newId(),
      bytes = new Uint8Array([1]),
      hash = await digest(bytes);
    await expect(
      decodePack(
        await encodePack(
          libraryId,
          [
            { hash, bytes },
            { hash, bytes },
          ],
          []
        ),
        libraryId
      )
    ).rejects.toMatchObject({ code: "CORRUPT" });
    await expect(
      decodePack(
        await encodePack(libraryId, [{ hash, bytes }], ["f".repeat(64)]),
        libraryId
      )
    ).rejects.toMatchObject({ code: "CORRUPT" });
  });
  it("references documents/pages without Workspace ownership or duplicated content", () => {
    const ref = {
      version: 1 as const,
      type: "sylf-note" as const,
      libraryId: newId(),
      documentId: newId(),
      pageId: newId(),
    };
    expect(notesResourceId(ref)).toContain(ref.pageId);
    expect(notesResourceURL(ref)).toContain("page=" + ref.pageId);
    expect(() =>
      notesResourceId({ ...ref, documentId: "not-an-id" })
    ).toThrow();
  });
});

function relay() {
  const reads = new Map<string, number>();
  const files = new Map<
    string,
    { id: string; hash: string; version: string; bytes: Uint8Array }
  >();
  const state = {
    lost: false,
    quota: false,
    unreadable: false,
    retireOnRead: undefined as string | undefined,
  };
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, "http://notes.test");
    if (url.searchParams.get("action") === "upload") {
      if (state.quota) return Response.json({ code: "QUOTA" }, { status: 403 });
      const bytes = new Uint8Array(init.body as ArrayBuffer),
        hash = await digest(bytes),
        id = newId();
      expect(hash).toBe(url.searchParams.get("hash"));
      expect(bytes.length).toBeLessThanOrEqual(4_400_000);
      const file = { id, hash, version: "1", bytes };
      files.set(id, file);
      if (state.lost) {
        state.lost = false;
        throw new Error("lost response after commit");
      }
      return Response.json({ file: { id, hash, version: "1" } });
    }
    const body = JSON.parse(String(init.body));
    if (body.action === "list")
      return Response.json({
        files: [...files.values()].map(({ id, hash, version }) => ({
          id,
          hash,
          version,
        })),
      });
    if (body.action === "read") {
      reads.set(body.fileId, (reads.get(body.fileId) || 0) + 1);
      if (state.retireOnRead === body.fileId) {
        files.delete(body.fileId);
        state.retireOnRead = undefined;
      }
      if (!files.has(body.fileId))
        return Response.json({ code: "CORRUPT" }, { status: 409 });
      if (state.unreadable)
        return Response.json({ code: "NETWORK" }, { status: 503 });
      return new Response(files.get(body.fileId)!.bytes.slice().buffer);
    }
    throw new Error("Unexpected relay operation");
  });
  return { files, state, reads };
}
function transport(ctx: Awaited<ReturnType<typeof setup>>) {
  return new GoogleDriveTransport(
    {
      ownerId: ctx.session.ownerId,
      libraryId: ctx.repo.libraryId,
      bindingGeneration: 1,
      provider: ctx.binding.provider,
      accountId: ctx.binding.accountId,
      rootId: ctx.binding.rootId,
    },
    ctx.session,
    (hash) => ctx.repo.readObject(hash)
  );
}
describe("production batched Drive synchronization with synthetic relay", () => {
  it("downloads each small history pack once into a genuinely empty encrypted device", async () => {
    const source = await setup(),
      remote = relay(),
      d = await seed(source.repo),
      seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      if (i) {
        const view = await source.repo.document(d.documentId),
          loaded = await source.repo.loadStream(
            d.documentId,
            d.streams[0].streamId,
            1
          );
        loaded.doc
          .getText("text")
          .insert(loaded.doc.getText("text").length, ` revision-${i}`);
        await source.repo.save({
          operationId: newId(),
          documentId: d.documentId,
          parents: view.heads,
          kind: "edit",
          descriptor: d,
          updates: [
            {
              streamId: d.streams[0].streamId,
              epoch: 1,
              bytes: Y.encodeStateAsUpdate(loaded.doc),
            },
          ],
        });
        loaded.doc.destroy();
      }
      const heads = (await source.repo.document(d.documentId)).heads,
        closure = await source.repo.closure(heads),
        objects = closure.filter((o) => !seen.has(o.hash));
      closure.forEach((o) => seen.add(o.hash));
      const bytes = await encodePack(source.repo.libraryId, objects, heads),
        id = newId();
      remote.files.set(id, {
        id,
        hash: await digest(bytes),
        version: "1",
        bytes,
      });
    }
    const newestFirst = [...remote.files.values()].reverse();
    remote.files.clear();
    newestFirst.forEach((f) => remote.files.set(f.id, f));
    const target = await setup({ libraryId: source.repo.libraryId }),
      sync = new NotesSynchronizer(target.repo, transport(target));
    expect(await target.repo.catalogPage()).toHaveLength(0);
    await sync.pull();
    const restored = await target.repo.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(restored.doc.getText("text").toString()).toContain("revision-11");
    restored.doc.destroy();
    expect([...remote.reads.values()]).toEqual(Array(12).fill(1));
  });
  it("recovers a cold encrypted device when an identical pack is retired during its download", async () => {
    const cloud = relay(),
      a = await setup(),
      descriptor = await seed(a.repo);
    await new NotesSynchronizer(a.repo, transport(a)).publish();
    const original = [...cloud.files.values()][0],
      duplicate = { ...original, id: newId() };
    cloud.files.set(duplicate.id, duplicate);
    const b = await setup({ libraryId: a.repo.libraryId }),
      t = transport(b);
    await t.refresh();
    expect(t.duplicatePackHashes()).toEqual([original.hash]);
    cloud.state.retireOnRead = original.id;
    await new NotesSynchronizer(b.repo, t).pull();
    expect(
      (await b.repo.document(descriptor.documentId)).descriptor.title
    ).toBe(descriptor.title);
    const loaded = await b.repo.loadStream(
      descriptor.documentId,
      descriptor.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toBe("private-body-marker");
    loaded.doc.destroy();
    expect(cloud.files.size).toBe(1);
    expect(t.duplicatePackHashes()).toEqual([]);
  });
  it("reconciles a lost upload response, reconstructs another encrypted device, and retains conflicting deletion/edit heads", async () => {
    const cloud = relay(),
      a = await setup(),
      descriptor = await seed(a.repo),
      ta = transport(a),
      sa = new NotesSynchronizer(a.repo, ta);
    cloud.state.lost = true;
    expect(await sa.publish()).toBe(1);
    expect(cloud.files.size).toBe(1);
    const b = await setup({ libraryId: a.repo.libraryId }),
      tb = transport(b),
      sb = new NotesSynchronizer(b.repo, tb);
    await sb.pull();
    const stream = await NotesStream.open(
      b.repo,
      descriptor.documentId,
      descriptor.streams[0].streamId,
      1
    );
    disposers.push(() => stream.close());
    const old = await a.repo.document(descriptor.documentId);
    await a.repo.save({
      operationId: newId(),
      documentId: descriptor.documentId,
      parents: old.heads,
      descriptor: old.descriptor,
      kind: "tombstone",
    });
    stream.doc.getText("text").insert(0, "offline branch ");
    await stream.flush();
    await sa.publish();
    await sb.publish();
    await sa.pull();
    const merged = await a.repo.document(descriptor.documentId);
    expect(merged.heads.length).toBe(2);
    expect(merged.state).toBe("conflict");
    const loaded = await a.repo.loadStream(
      descriptor.documentId,
      descriptor.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toContain("offline branch");
    loaded.doc.destroy();
  });
  it("acknowledges downloads only after activation and skips already adopted packs without rewriting document heads", async () => {
    relay();
    const a = await setup(),
      d = await seed(a.repo),
      source = new NotesSynchronizer(a.repo, transport(a));
    await source.publish();
    let fail = true;
    const b = await setup({
        libraryId: a.repo.libraryId,
        fault: (p) => {
          if (fail && p === "before-commit")
            throw new Error("interrupted adoption");
        },
      }),
      t = transport(b),
      target = new NotesSynchronizer(b.repo, t);
    await expect(target.pull()).rejects.toThrow();
    expect(await b.repo.cursor("primary")).toBeUndefined();
    fail = false;
    await target.pull();
    expect((await b.repo.document(d.documentId)).descriptor.title).toBe(
      d.title
    );
    expect((await t.enumerate("done", b.session.signal)).revisionIds).toEqual(
      []
    );
    const raw = new Dexie(b.name);
    await raw.open();
    disposers.push(() => raw.close());
    const before = (await raw.table("documents").toArray())[0].version;
    await target.pull();
    expect((await raw.table("documents").toArray())[0].version).toBe(before);
  });
  it("explains an origin rejection without treating it as an outage or closing local access", async () => {
    const a = await setup();
    vi.stubGlobal("fetch", async () =>
      Response.json({ code: "ORIGIN" }, { status: 403 })
    );
    await expect(notesRequest("/api/notes/connection")).rejects.toThrow(
      "permanent Sylf address"
    );
    expect(a.session.signal.aborted).toBe(false);
  });
  it("closes local key capabilities immediately on a broker 401 while keeping revoked Drive consent recoverable", async () => {
    const a = await setup();
    await seed(a.repo);
    vi.stubGlobal("fetch", async () =>
      Response.json({ code: "AUTH" }, { status: 409 })
    );
    await expect(notesRequest("/api/notes/drive")).rejects.toMatchObject({
      code: "AUTH",
    });
    expect(a.session.signal.aborted).toBe(false);
    vi.stubGlobal("fetch", async () =>
      Response.json({ code: "AUTH" }, { status: 401 })
    );
    await expect(notesRequest("/api/notes/drive")).rejects.toMatchObject({
      code: "SESSION_ENDED",
    });
    expect(a.session.signal.aborted).toBe(true);
  });
  it("retains blocked outbox jobs on quota and never acknowledges unreadable uploaded bytes", async () => {
    const cloud = relay(),
      a = await setup();
    await seed(a.repo);
    const sync = new NotesSynchronizer(a.repo, transport(a));
    cloud.state.quota = true;
    await expect(sync.publish()).rejects.toMatchObject({ code: "QUOTA" });
    const jobs = await a.repo.jobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].state).toBe("blocked");
    cloud.state.quota = false;
    cloud.state.unreadable = true;
    await a.repo.resumeBlockedJobs();
    await expect(sync.publish()).rejects.toMatchObject({ code: "NETWORK" });
    expect((await a.repo.jobs())[0].state).toBe("pending");
    expect((await a.repo.jobs())[0].verifiedAt).toBeUndefined();
  });
  it("bounds payloads for full size objects and invalidates persisted cursors after transport restart", async () => {
    const cloud = relay(),
      a = await setup(),
      t = transport(a),
      objects = [];
    for (let i = 0; i < 3; i++) {
      const bytes = new Uint8Array(4 * 1024 * 1024);
      bytes[0] = i;
      objects.push({ hash: await digest(bytes), bytes });
    }
    await t.createMany(objects, [], a.session.signal);
    expect(cloud.files.size).toBe(3);
    const page = await t.enumerate(undefined, a.session.signal);
    expect(page.more).toBe(true);
    const restarted = transport(a);
    await expect(
      restarted.enumerate(page.cursor, a.session.signal)
    ).rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
    expect((await restarted.enumerate(undefined, a.session.signal)).more).toBe(
      true
    );
    const sync = new NotesSynchronizer(a.repo, restarted);
    await sync.pull("bounded", 1);
    expect(sync.downloadIncomplete).toBe(true);
    await sync.pull("bounded", 100);
    expect(sync.downloadIncomplete).toBe(false);
    for (const o of objects)
      expect(
        await digest((await restarted.candidates(o.hash, a.session.signal))[0])
      ).toBe(o.hash);
  });
  it("invalidates a cached pack when Drive's version changes and rejects corrupt replacement bytes", async () => {
    const cloud = relay(),
      a = await setup(),
      t = transport(a),
      bytes = new Uint8Array([11, 12]),
      hash = await digest(bytes);
    await t.createMany([{ hash, bytes }], [], a.session.signal);
    expect((await t.candidates(hash, a.session.signal))[0]).toEqual(bytes);
    const file = [...cloud.files.values()][0];
    file.bytes[file.bytes.length - 1] ^= 1;
    file.version = "2";
    await t.refresh();
    await expect(t.candidates(hash, a.session.signal)).rejects.toMatchObject({
      code: "CORRUPT",
    });
  });
  it("expires a listing if one file has inconsistent versions across its pages", async () => {
    const a = await setup(),
      t = transport(a),
      id = newId(),
      hash = "0".repeat(64);
    vi.stubGlobal("fetch", async () =>
      Response.json({
        files: [
          { id, hash, version: "1" },
          { id, hash, version: "2" },
        ],
      })
    );
    await expect(t.refresh()).rejects.toMatchObject({ code: "CURSOR_EXPIRED" });
  });
  it("does not trust an old receipt after cloud file removal, including a fresh transport process", async () => {
    const cloud = relay(),
      a = await setup(),
      d = await seed(a.repo),
      t = transport(a),
      sync = new NotesSynchronizer(a.repo, t);
    await sync.publish();
    await sync.verifyAcknowledged();
    cloud.files.clear();
    const fresh = transport(a);
    await fresh.refresh();
    await expect(
      new NotesSynchronizer(a.repo, fresh).verifyAcknowledged()
    ).rejects.toMatchObject({ code: "CORRUPT" });
    expect((await a.repo.document(d.documentId)).descriptor.title).toBe(
      d.title
    );
  });
  it("preserves more than 500 logical objects by splitting batches", async () => {
    const cloud = relay(),
      a = await setup(),
      t = transport(a),
      objects = [];
    for (let i = 0; i < 510; i++) {
      const bytes = new TextEncoder().encode(String(i));
      objects.push({ hash: await digest(bytes), bytes });
    }
    await t.createMany(objects, [], a.session.signal);
    expect(cloud.files.size).toBe(2);
    const reader = transport(a);
    await reader.refresh();
    expect(
      (await reader.candidates(objects[509].hash, a.session.signal))[0]
    ).toEqual(objects[509].bytes);
  });
  it("exports retained failed-save capsules after editor teardown, denies foreign owners, and safely retries", async () => {
    let fail = false;
    const a = await setup({
        fault: (p) => {
          if (fail && p === "after-journal")
            throw new DOMException("full", "QuotaExceededError");
        },
      }),
      d = await seed(a.repo),
      stream = await NotesStream.open(
        a.repo,
        d.documentId,
        d.streams[0].streamId,
        1
      );
    fail = true;
    stream.doc.getText("text").insert(0, "retained capsule ");
    await expect(stream.flush()).rejects.toMatchObject({ code: "QUOTA" });
    stream.close();
    expect(retainedNotesRecovery(a.repo)).toHaveLength(1);
    const foreign = await setup({ owner: "2", libraryId: a.repo.libraryId });
    expect(retainedNotesRecovery(foreign.repo)).toEqual([]);
    const archive = await exportNotesRecovery(
        a.repo,
        retainedNotesRecovery(a.repo)
      ),
      fresh = await setup({ libraryId: a.repo.libraryId });
    await importNotes(fresh.repo, archive);
    const loaded = await fresh.repo.loadStream(
      d.documentId,
      d.streams[0].streamId,
      1
    );
    expect(loaded.doc.getText("text").toString()).toContain("retained capsule");
    loaded.doc.destroy();
    fail = false;
    expect(await recoverUnacknowledged(a.repo)).toBe(1);
    expect(retainedNotesRecovery(a.repo)).toEqual([]);
  });
});

describe("quiet durable replication", () => {
  it("persists scan progress and receipts without broadcasting them as document edits", async () => {
    const a = await setup();
    const d = await seed(a.repo);
    const heads = (await a.repo.document(d.documentId)).heads;
    const objects = await a.repo.closure(heads);
    const changed = vi.fn();
    a.repo.subscribe(changed);
    await a.repo.installBatch([], [], "remote", {
      channel: "quiet",
      value: "done",
    });
    expect(await a.repo.cursor("quiet")).toBe("done");
    await a.repo.installBatch(objects, heads, "remote");
    expect(changed).not.toHaveBeenCalled();
    expect((await a.repo.document(d.documentId)).heads).toEqual(heads);
    await seed(a.repo, "A real new note");
    expect(changed).toHaveBeenCalledTimes(1);
    const job = await a.repo.claimJob();
    await a.repo.settleJob(job!.id, job!.leaseId!, { verified: true });
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("reads each physical pack once on cold discovery even after the four-pack memory cache evicts it", async () => {
    const a = await setup();
    const remote = relay();
    for (let i = 0; i < 7; i++) {
      const d = await seed(a.repo, "Synthetic page " + i);
      const heads = (await a.repo.document(d.documentId)).heads;
      const bytes = await encodePack(
        a.repo.libraryId,
        await a.repo.closure(heads),
        heads
      );
      const id = newId();
      remote.files.set(id, {
        id,
        hash: await digest(bytes),
        version: "1",
        bytes,
      });
    }
    const t = transport(a),
      sync = new NotesSynchronizer(a.repo, t);
    await sync.pull();
    await sync.verifyAcknowledged();
    expect([...remote.reads.values()]).toEqual(Array(7).fill(1));
    const changed = vi.fn();
    a.repo.subscribe(changed);
    await sync.pull();
    expect(changed).not.toHaveBeenCalled();
    expect([...remote.reads.values()]).toEqual(Array(7).fill(1));
    const file = [...remote.files.values()][0];
    remote.files.delete(file.id);
    await sync.pull();
    await expect(sync.verifyAcknowledged()).rejects.toMatchObject({
      code: "CORRUPT",
    });
  });
});

// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import { NotesLibrary } from "@/lib/notes/library";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { createNotesVault } from "@/lib/notes/vault";
import { digest } from "@/lib/notes/bytes";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import { encodePack } from "@/lib/notes/pack";

const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const remove of cleanup.splice(0).reverse()) await remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function identity(libraryId: string, label: string) {
  const h = (await digest(new TextEncoder().encode(libraryId + ":" + label)))
    .slice(0, 32)
    .split("");
  h[12] = "5";
  h[16] = "a";
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
async function fixture(count: number, detached = false) {
  const libraryId = newId(),
    name = `sylf-notes-vault-v1:1:${libraryId}`,
    session = new NotesSession("1", () => "1"),
    secret = crypto.getRandomValues(new Uint8Array(32));
  const descriptor = {
    format: "sylf-notes" as const,
    formatVersion: 1 as const,
    minimumReaderVersion: 1,
    libraryId,
    ownerRef: "1",
    bindingGeneration: 1,
    extensions: {},
  };
  const binding = {
    provider: "google-drive" as const,
    accountId: "synthetic",
    rootId: "synthetic",
    generation: 1,
    verifiedAt: new Date(0).toISOString(),
    probeHash: "0".repeat(64),
  };
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: detached ? name + ":source" : name,
    cipher: await createNotesVault(
      secret.slice(),
      JSON.stringify(["1", libraryId]),
      session
    ),
  });
  cleanup.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
    if (detached) await Dexie.delete(name + ":source");
  });
  await repo.registerLibrary(descriptor, binding);
  const catalogId = await identity(libraryId, "catalog"),
    stream = await identity(libraryId, "catalog-stream");
  for (let i = 0; i < count; i++) {
    const internal = i === 0,
      documentId = internal ? catalogId : newId(),
      streamId = internal ? stream : newId();
    const document: DocumentDescriptor = {
      ...descriptor,
      documentId,
      kind: "flow",
      title: internal ? "Library organization" : `Synthetic ${i}`,
      schemaVersion: 1,
      folderId: null,
      subjectId: null,
      streams: [
        {
          streamId,
          epoch: 1,
          codec: "yjs13-update-v1",
          adapter: internal ? "sylf-library/1" : "text-test",
          schemaVersion: 1,
          projection: {
            root: internal ? "folders" : "text",
            type: internal ? "map" : "text",
          },
        },
      ],
      pages: [],
      assets: [],
      requiredFeatures: [],
      extensions: internal ? { sylfInternal: "library-v1" } : {},
    };
    const doc = new Y.Doc();
    if (!internal) doc.getText("text").insert(0, "Synthetic original content");
    await repo.save({
      operationId: newId(),
      documentId,
      parents: [],
      kind: "create",
      descriptor: document,
      updates: [{ streamId, epoch: 1, bytes: Y.encodeStateAsUpdate(doc) }],
    });
    doc.destroy();
  }
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("navigator", {
    onLine: true,
    storage: { persist: async () => false },
  });
  const cloud = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(init.signal!.reason),
          { once: true }
        );
      })
  );
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    if (url.startsWith("/api/notes/unlock"))
      return Response.json({
        descriptor,
        binding,
        label: "Synthetic",
        status: "ACTIVE",
        vaultKey: Buffer.from(secret).toString("base64"),
        access: {
          configured: true,
          localAccess: true,
          connection: {
            descriptor,
            binding,
            label: "Synthetic",
            status: "ACTIVE",
          },
        },
      });
    return cloud(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
  return { repo, catalogId, cloud, fetcher };
}

it("returns encrypted local metadata before catalog replay or an unresponsive Drive, then completes paging", async () => {
  const f = await fixture(56),
    original = IndexedDbNotesRepository.prototype.loadStream;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(IndexedDbNotesRepository.prototype, "loadStream").mockImplementation(
    async function (this: IndexedDbNotesRepository, ...args) {
      if (args[0] === f.catalogId) await gate;
      return original.apply(this, args);
    }
  );
  const library = await NotesLibrary.bootstrap(
    "1",
    () => true,
    false,
    (info) => !!info.connection
  );
  expect(library).toBeDefined();
  cleanup.push(() => library!.close());
  expect(library!.snapshot()).toMatchObject({
    localReady: true,
    ready: false,
    catalogComplete: false,
  });
  expect(library!.snapshot().notes.length).toBeGreaterThan(0);
  expect(library!.snapshot().notes.length).toBeLessThan(55);
  expect(f.cloud).not.toHaveBeenCalled();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(f.fetcher.mock.calls[0][0]).toContain("bootstrap=1");
  release();
  await vi.waitFor(() =>
    expect(library!.snapshot()).toMatchObject({
      ready: true,
      catalogComplete: true,
    })
  );
  expect(library!.snapshot().notes).toHaveLength(55);
  await vi.waitFor(() => expect(f.cloud).toHaveBeenCalled());
  library!.session.close();
  expect(library!.snapshot().notes).toHaveLength(0);
  await expect(library!.repository.catalogPage()).rejects.toMatchObject({
    code: "SESSION_ENDED",
  });
});
it("returns recovery controls on a fresh device without waiting for a hung cloud or creating an empty replacement", async () => {
  const f = await fixture(0),
    library = await NotesLibrary.bootstrap(
      "1",
      () => true,
      false,
      () => true
    );
  cleanup.push(() => library!.close());
  expect(library!.snapshot().ready).toBe(false);
  expect(library!.snapshot().localReady).toBeFalsy();
  await vi.waitFor(() => expect(f.cloud).toHaveBeenCalled());
  expect(await f.repo.hasDocument(f.catalogId)).toBe(false);
});
it("fences account changes while the authenticated bootstrap request is in flight", async () => {
  const f = await fixture(2);
  let current = true;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const response = await f.fetcher(url, init);
    current = false;
    return response;
  });
  const onAccess = vi.fn(() => true);
  await expect(
    NotesLibrary.bootstrap("1", () => current, false, onAccess)
  ).rejects.toMatchObject({ code: "SESSION_ENDED" });
  expect(onAccess).not.toHaveBeenCalled();
});
it("reports a stalled startup request without discarding the encrypted local library", async () => {
  const f = await fixture(2);
  const timeout = AbortSignal.timeout;
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
    ms === 15000
      ? AbortSignal.abort(
          new DOMException("Synthetic request deadline", "TimeoutError")
        )
      : timeout(ms)
  );
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    expect(init.signal).toBeDefined();
    init.signal!.throwIfAborted();
    throw new Error("Expected the startup deadline");
  });
  await expect(
    NotesLibrary.bootstrap(
      "1",
      () => true,
      false,
      () => true
    )
  ).rejects.toThrow("Opening Notes took too long");
  expect(await f.repo.catalogPage()).toHaveLength(2);
});
it("hands off an empty deployment without starting a cloud restore, but never strands staged originals", async () => {
  const empty = await fixture(0),
    handoff = vi.fn(() => false);
  expect(
    await NotesLibrary.bootstrap(
      "1",
      () => true,
      false,
      () => true,
      handoff
    )
  ).toBeUndefined();
  expect(handoff).toHaveBeenCalledTimes(1);
  expect(empty.cloud).not.toHaveBeenCalled();
  const staged = await fixture(0);
  await staged.repo.stageAsset(
    new Uint8Array([1, 2, 3]),
    "application/octet-stream",
    "original.bin"
  );
  handoff.mockClear();
  const library = await NotesLibrary.bootstrap(
    "1",
    () => true,
    false,
    () => true,
    handoff
  );
  cleanup.push(() => library!.close());
  expect(handoff).not.toHaveBeenCalled();
  expect((await staged.repo.pendingAssets())[0].name).toBe("original.bin");
});
it("exposes atomically restored notes before later packs arrive, without inventing a catalog", async () => {
  const f = await fixture(4, true),
    rows = await f.repo.catalogPage();
  const notes = rows.filter((row) => row.documentId !== f.catalogId),
    catalog = rows.find((row) => row.documentId === f.catalogId)!;
  const groups = [[notes[0]], [notes[1]], [catalog, notes[2]]];
  const files = await Promise.all(
    groups.map(async (group, i) => {
      const revisions = group.flatMap((row) => row.view.heads),
        objects = await f.repo.closure(revisions),
        bytes = await encodePack(f.repo.libraryId, objects, revisions);
      return {
        id: `synthetic-${i}`,
        hash: await digest(bytes),
        version: "1",
        bytes,
      };
    })
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mutations = vi.fn();
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (url.startsWith("/api/notes/unlock")) return f.fetcher(url, init);
    const input = JSON.parse(String(init.body));
    if (input.action === "list")
      return Response.json({
        files: files.map(({ id, hash, version }) => ({ id, hash, version })),
      });
    if (input.action === "read") {
      if (input.fileId === "synthetic-2") await gate;
      return new Response(
        files.find((file) => file.id === input.fileId)!.bytes.slice().buffer
      );
    }
    mutations();
    throw Error("A cold restore must not publish replacement content");
  });
  const library = await NotesLibrary.bootstrap(
    "1",
    () => true,
    false,
    () => true
  );
  cleanup.push(() => library!.close());
  await vi.waitFor(() => expect(library!.snapshot().notes).toHaveLength(2));
  expect(library!.snapshot()).toMatchObject({
    localReady: true,
    ready: false,
    restorePending: true,
  });
  expect(await library!.repository.hasDocument(f.catalogId)).toBe(false);
  const stream = notes[0].view.descriptor.streams[0],
    restored = await library!.repository.loadStream(
      notes[0].documentId,
      stream.streamId,
      1
    );
  expect(restored.doc.getText("text").toString()).toBe(
    "Synthetic original content"
  );
  restored.doc.destroy();
  release();
  await vi.waitFor(() =>
    expect(library!.snapshot()).toMatchObject({
      ready: true,
      restorePending: false,
    })
  );
  await library!.synchronize();
  expect(library!.snapshot().notes).toHaveLength(3);
  expect(mutations).not.toHaveBeenCalled();
});

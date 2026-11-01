// @vitest-environment node
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { afterEach, expect, it, vi } from "vitest";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { createNotesVault } from "@/lib/notes/vault";
import { NotesSession } from "@/lib/notes/session";
import {
  NotesSynchronizer,
  TransportError,
  type NotesTransport,
} from "@/lib/notes/sync";
import { NotesLibrary } from "@/lib/notes/library";
import { digest } from "@/lib/notes/bytes";

const cleanup: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(libraryId = newId()) {
  const name = "notes-hardening-" + newId(),
    session = new NotesSession("1", () => "1");
  const cipher = await createNotesVault(
      new Uint8Array(32).fill(19),
      JSON.stringify(["1", libraryId]),
      session
    ),
    repo = new IndexedDbNotesRepository({
      session,
      libraryId,
      bindingGeneration: 1,
      databaseName: name,
      cipher,
    });
  const descriptor = {
      format: "sylf-notes" as const,
      formatVersion: 1 as const,
      minimumReaderVersion: 1,
      libraryId,
      ownerRef: "1",
      bindingGeneration: 1,
      extensions: {},
    },
    binding = {
      provider: "google-drive" as const,
      accountId: "synthetic",
      rootId: "synthetic",
      generation: 1,
      verifiedAt: new Date().toISOString(),
      probeHash: "0".repeat(64),
    };
  await repo.registerLibrary(descriptor, binding);
  cleanup.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  return { repo, session, name, descriptor, binding };
}
async function history(
  ctx: Awaited<ReturnType<typeof setup>>,
  count = 25,
  asset = false
) {
  const doc: DocumentDescriptor = {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId: ctx.repo.libraryId,
    documentId: newId(),
    kind: "flow",
    title: "Hardening fixture",
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
  if (asset)
    doc.assets.push(
      await ctx.repo.stageAsset(
        new Uint8Array([1, 2, 3, 4]),
        "image/png",
        "original.png"
      )
    );
  const y = new Y.Doc(),
    ids: string[] = [],
    streamId = doc.streams[0].streamId;
  let update: Uint8Array = new Uint8Array();
  y.on("update", (bytes) => {
    update = bytes;
  });
  let ref:
    | Awaited<ReturnType<typeof ctx.repo.document>>["descriptorRef"]
    | undefined;
  for (let i = 0; i < count; i++) {
    y.getText("text").insert(y.getText("text").length, "x");
    const r = await ctx.repo.save({
      operationId: newId(),
      documentId: doc.documentId,
      parents: ids.length ? [ids.at(-1)!] : [],
      kind: i ? "edit" : "create",
      descriptor: ref || doc,
      updates: [{ streamId, epoch: 1, bytes: update }],
    });
    ids.push(r.revisionId);
    ref ||= (await ctx.repo.document(doc.documentId)).descriptorRef;
  }
  y.destroy();
  return { doc, ids };
}
it("checks shared source once, propagates corruption to descendants and retains healthy ancestors", async () => {
  const ctx = await setup(),
    h = await history(ctx, 60, true),
    read = ctx.repo.readObject.bind(ctx.repo);
  let reads = 0;
  ctx.repo.readObject = async (hash) => {
    reads++;
    return read(hash);
  };
  const before = await ctx.repo.storageStats(),
    good = await ctx.repo.inspectIntegrity();
  expect(good.issues).toEqual([]);
  expect(good.recoverableHeads[h.doc.documentId]).toEqual([h.ids.at(-1)]);
  expect(reads).toBeLessThanOrEqual(before.objects + 2);
  expect(await ctx.repo.storageStats()).toEqual(before);
  ctx.repo.readObject = read;
  const revisions = await ctx.repo.listRevisions(h.doc.documentId),
    broken = revisions.find((r) => r.id === h.ids[25])!.commit.updates[0]
      .content.parts[0];
  const db = new Dexie(ctx.name);
  await db.open();
  cleanup.push(() => db.close());
  await db
    .table("objects")
    .update([ctx.repo.scope, broken.hash], { bytes: new Uint8Array([0]) });
  const bad = await ctx.repo.inspectIntegrity();
  expect(bad.issues.map((i) => i.id).sort()).toEqual(h.ids.slice(25).sort());
  expect(bad.recoverableHeads[h.doc.documentId]).toEqual([h.ids[24]]);
  expect((await ctx.repo.listRevisions(h.doc.documentId)).length).toBe(60);
});
it("finds surviving unindexed ancestors without erasing journal-recovery evidence", async () => {
  const ctx = await setup(),
    h = await history(ctx, 12),
    db = new Dexie(ctx.name);
  await db.open();
  cleanup.push(() => db.close());
  await db.table("journal").delete([ctx.repo.scope, h.ids[4]]);
  const result = await ctx.repo.inspectIntegrity();
  expect(result.issues).toEqual([{ id: h.ids[4], code: "JOURNAL_MISSING" }]);
  expect(result.recoverableHeads[h.doc.documentId]).toEqual([h.ids.at(-1)]);
  await ctx.repo.recoverLostJournal(h.doc.documentId);
  expect((await ctx.repo.inspectIntegrity()).issues).toEqual([]);
});
it("cancels a read-only integrity scan without a partial success or changed storage", async () => {
  const ctx = await setup();
  await history(ctx, 30);
  const before = await ctx.repo.storageStats(),
    controller = new AbortController(),
    stages: string[] = [];
  await expect(
    ctx.repo.inspectIntegrity({
      signal: controller.signal,
      onProgress: (p) => {
        stages.push(p.stage);
        controller.abort();
      },
    })
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(stages.length).toBeGreaterThan(0);
  expect(await ctx.repo.storageStats()).toEqual(before);
});
it("stops integrity reads promptly when owner access ends", async () => {
  const ctx = await setup();
  await history(ctx, 20);
  const read = ctx.repo.readObject.bind(ctx.repo);
  let reads = 0;
  ctx.repo.readObject = async (hash) => {
    if (++reads === 3) ctx.session.close();
    return read(hash);
  };
  await expect(ctx.repo.inspectIntegrity()).rejects.toMatchObject({
    code: "SESSION_ENDED",
  });
  expect(reads).toBe(3);
});
it("claims bounded outbox batches atomically across tabs and rejects expired lease acknowledgements", async () => {
  const ctx = await setup();
  await history(ctx, 12);
  const session = new NotesSession("1", () => "1"),
    cipher = await createNotesVault(
      new Uint8Array(32).fill(19),
      JSON.stringify(["1", ctx.repo.libraryId]),
      session
    ),
    other = new IndexedDbNotesRepository({
      session,
      libraryId: ctx.repo.libraryId,
      bindingGeneration: 1,
      databaseName: ctx.name,
      cipher,
    });
  cleanup.push(() => {
    session.close();
    other.close();
  });
  const [a, b] = await Promise.all([
    ctx.repo.claimJobs(5, 100, 10),
    other.claimJobs(5, 100, 10),
  ]);
  expect(new Set([...a, ...b].map((j) => j.id)).size).toBe(10);
  expect(await ctx.repo.claimJobs(100, 105, 10)).toHaveLength(2);
  const reclaimed = await other.claimJobs(100, 111, 10);
  expect(reclaimed).toHaveLength(10);
  await expect(
    ctx.repo.settleJob(a[0].id, a[0].leaseId!, { verified: true })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await other.settleJob(reclaimed[0].id, reclaimed[0].leaseId!, {
    verified: true,
  });
  expect(
    (await ctx.repo.jobs()).filter((j) => j.state === "verified")
  ).toHaveLength(1);
  await expect(ctx.repo.claimJobs(101)).rejects.toMatchObject({
    code: "LIMIT",
  });
  expect(await ctx.repo.jobs()).toHaveLength(12);
});
async function remoteFixture(count = 25) {
  const source = await setup(),
    h = await history(source, count),
    objects = new Map(
      (await source.repo.closure([h.ids.at(-1)!])).map((o) => [o.hash, o.bytes])
    );
  const target = await setup(source.repo.libraryId),
    calls = new Map<string, number>();
  const transport: NotesTransport = {
    scope: {
      ownerId: "1",
      libraryId: source.repo.libraryId,
      bindingGeneration: 1,
      provider: "google-drive",
      accountId: "synthetic",
      rootId: "synthetic",
    },
    candidates: async (hash) => {
      calls.set(hash, (calls.get(hash) || 0) + 1);
      return objects.has(hash) ? [objects.get(hash)!.slice()] : [];
    },
    create: async () => {},
    enumerate: async (cursor) => {
      const index = cursor && cursor !== "done" ? Number(cursor) : 0;
      const tip = Math.min(count - 1, index + 4);
      return {
        revisionIds: [h.ids[tip]],
        cursor: tip + 1 === count ? "done" : String(tip + 1),
        more: tip + 1 < count,
      };
    },
  };
  return { source, target, h, objects, calls, transport };
}
it("reuses only successfully installed proofs within one pull and verifies provider bytes again on the next pull", async () => {
  const f = await remoteFixture(),
    sync = new NotesSynchronizer(f.target.repo, f.transport);
  await sync.pull();
  expect([...f.calls.values()].every((n) => n === 1)).toBe(true);
  const loaded = await f.target.repo.loadStream(
    f.h.doc.documentId,
    f.h.doc.streams[0].streamId,
    1
  );
  expect(loaded.doc.getText("text").length).toBe(25);
  loaded.doc.destroy();
  const first = (await f.source.repo.listRevisions(f.h.doc.documentId)).find(
    (r) => r.id === f.h.ids[0]
  )!.commit.updates[0].content.parts[0].hash;
  f.calls.clear();
  f.objects.delete(first);
  await expect(sync.pull()).rejects.toMatchObject({ code: "CORRUPT" });
  expect(f.calls.get(first)).toBeGreaterThan(0);
  expect((await f.target.repo.document(f.h.doc.documentId)).heads).toEqual([
    f.h.ids.at(-1),
  ]);
});
it("discards pull proofs when an expired cursor restarts provider discovery", async () => {
  const f = await remoteFixture(15);
  let expired = false;
  const first = (await f.source.repo.listRevisions(f.h.doc.documentId)).find(
    (r) => r.id === f.h.ids[0]
  )!.commit.updates[0].content.parts[0].hash;
  const enumerate = f.transport.enumerate;
  f.transport.enumerate = async (cursor, signal) => {
    if (cursor && !expired) {
      expired = true;
      f.objects.delete(first);
      throw new TransportError("CURSOR_EXPIRED");
    }
    return enumerate(cursor, signal);
  };
  await expect(
    new NotesSynchronizer(f.target.repo, f.transport).pull()
  ).rejects.toMatchObject({ code: "CORRUPT" });
  expect((await f.target.repo.listRevisions(f.h.doc.documentId)).length).toBe(
    5
  );
  expect(await f.target.repo.cursor("primary")).toBe("5");
});
it("leases decoded images per editor, deduplicates concurrent resolutions and fences late completion", async () => {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { onLine: false });
  const ctx = await setup(),
    h = await history(ctx, 1, true),
    library = await NotesLibrary.fromRepository(
      {
        ...ctx,
        descriptor: ctx.descriptor,
        binding: ctx.binding,
        label: "synthetic",
        status: "ACTIVE",
      },
      ctx.repo
    );
  cleanup.push(() => library.close());
  const create = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => "blob:" + newId()),
    revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
    ref = "sylf-asset:" + h.doc.assets[0].assetId;
  const a = library.imageResolver(h.doc.documentId),
    b = library.imageResolver(h.doc.documentId),
    [one, duplicate] = await Promise.all([a.resolve(ref), a.resolve(ref)]),
    two = await b.resolve(ref);
  expect(one).toBe(duplicate);
  expect(one).not.toBe(two);
  expect(create).toHaveBeenCalledTimes(2);
  a.close();
  expect(revoke).toHaveBeenCalledWith(one);
  expect(revoke).not.toHaveBeenCalledWith(two);
  expect(await b.resolve(ref)).toBe(two);
  await expect(a.resolve(ref)).rejects.toMatchObject({ code: "SESSION_ENDED" });
  const late = library.imageResolver(h.doc.documentId),
    read = ctx.repo.readContent.bind(ctx.repo);
  let started!: () => void, release!: () => void;
  const begun = new Promise<void>((r) => {
      started = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  ctx.repo.readContent = async (content) => {
    started();
    await gate;
    return read(content);
  };
  const pending = late.resolve(ref);
  await begun;
  late.close();
  release();
  await expect(pending).rejects.toMatchObject({ code: "SESSION_ENDED" });
  expect(create).toHaveBeenCalledTimes(2);
  ctx.repo.readContent = read;
  expect(await digest(await read(h.doc.assets[0].content))).toBe(
    h.doc.assets[0].assetId
  );
  ctx.session.close();
  expect(revoke).toHaveBeenCalledWith(two);
});

it("an explicit retry resumes after a network outage while retaining provider rate-limit delays", async () => {
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { onLine: true });
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ code: "NETWORK" }, { status: 503 })
    );
  vi.stubGlobal("fetch", fetch);
  const ctx = await setup();
  const library = await NotesLibrary.fromRepository(
    {
      ...ctx,
      descriptor: ctx.descriptor,
      binding: ctx.binding,
      label: "synthetic",
      status: "ACTIVE",
    },
    ctx.repo
  );
  cleanup.push(() => library.close());
  const initial = fetch.mock.calls.length;
  await library.synchronize();
  expect(fetch).toHaveBeenCalledTimes(initial);
  await library.retrySync().catch(() => {});
  expect(fetch).toHaveBeenCalledTimes(initial + 1);
  fetch.mockImplementation(async () =>
    Response.json(
      { code: "THROTTLE" },
      { status: 503, headers: { "retry-after": "60" } }
    )
  );
  await library.retrySync().catch(() => {});
  expect(fetch).toHaveBeenCalledTimes(initial + 2);
  await library.retrySync();
  expect(fetch).toHaveBeenCalledTimes(initial + 2);
});

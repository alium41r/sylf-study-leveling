// @vitest-environment node
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import * as Y from "yjs";
import { automaticSyncDue, isLocalDraft } from "@/lib/notes/cloud-policy";
import {
  publicationPath,
  DrivePublications,
} from "@/lib/notes/drive-publication";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import { exportNotes } from "@/lib/notes/portable";
import { digest, encodeJson } from "@/lib/notes/bytes";
import { NotesSynchronizer, type NotesTransport } from "@/lib/notes/sync";
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const f of cleanup.splice(0)) await f();
});
async function fixture() {
  const libraryId = newId(),
    name = "phase7-" + newId(),
    session = new NotesSession("1", () => "1");
  const repo = new IndexedDbNotesRepository({
    session,
    libraryId,
    bindingGeneration: 1,
    databaseName: name,
  });
  await repo.registerLibrary(
    {
      format: "sylf-notes",
      formatVersion: 1,
      minimumReaderVersion: 1,
      libraryId,
      ownerRef: "1",
      bindingGeneration: 1,
      extensions: {},
    },
    {
      provider: "google-drive",
      accountId: "test",
      rootId: "test",
      generation: 1,
      verifiedAt: new Date(0).toISOString(),
      probeHash: "0".repeat(64),
    }
  );
  cleanup.push(async () => {
    session.close();
    repo.close();
    await Dexie.delete(name);
  });
  const d: DocumentDescriptor = {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId,
    documentId: newId(),
    kind: "flow",
    title: "Untitled note",
    schemaVersion: 1,
    folderId: null,
    subjectId: null,
    streams: [
      {
        streamId: newId(),
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "blocknote/0.56.0",
        schemaVersion: 1,
        projection: { root: "body", type: "xml" },
      },
    ],
    pages: [],
    assets: [],
    requiredFeatures: [],
    extensions: {},
  };
  async function save(text = "", title = d.title) {
    const doc = new Y.Doc(),
      p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    if (text) t.insert(0, text);
    p.insert(0, [t]);
    doc.getXmlFragment("body").insert(0, [p]);
    try {
      await repo.save({
        operationId: newId(),
        documentId: d.documentId,
        parents: [],
        descriptor: { ...d, title },
        kind: "create",
        updates: [
          {
            streamId: d.streams[0].streamId,
            epoch: 1,
            bytes: Y.encodeStateAsUpdate(doc),
          },
        ],
      });
    } finally {
      doc.destroy();
    }
    return repo.document(d.documentId);
  }
  return { repo, d, save };
}
describe("Phase 7 local/cloud policy", () => {
  it("holds cloud work throughout typing, debounces bursts and polls a quiet unchanged library slowly", () => {
    expect(automaticSyncDue(90_000, 89_900, 0, true)).toBe(false);
    expect(automaticSyncDue(120_000, 90_000, 89_000, true)).toBe(true);
    expect(automaticSyncDue(120_000, 0, 115_000, true)).toBe(false);
    expect(automaticSyncDue(119_999, 0, 0, false)).toBe(false);
    expect(automaticSyncDue(120_000, 0, 0, false)).toBe(true);
  });
  it("keeps blank untitled drafts local and publishes named empty or meaningful untitled text", async () => {
    const a = await fixture();
    expect(await isLocalDraft(a.repo, await a.save())).toBe(true);
    const b = await fixture();
    expect(await isLocalDraft(b.repo, await b.save("", "Biology"))).toBe(false);
    const c = await fixture();
    expect(await isLocalDraft(c.repo, await c.save("Cell respiration"))).toBe(
      false
    );
    const view = await a.repo.document(a.d.documentId);
    view.descriptor.extensions.sylfTitleSet = true;
    expect(await isLocalDraft(a.repo, view)).toBe(false);
  });
  it("skips local-only jobs without leasing, deleting, acknowledging or starving eligible work", async () => {
    const a = await fixture();
    await a.save();
    const held = new Set((await a.repo.jobs()).map((j) => j.id));
    const another = { ...a.d, documentId: newId(), title: "Named empty note" };
    await a.repo.save({
      operationId: newId(),
      documentId: another.documentId,
      parents: [],
      descriptor: another,
      kind: "create",
      updates: [],
    });
    const objects = new Map<string, Uint8Array>();
    const transport: NotesTransport = {
      scope: {
        ownerId: "1",
        libraryId: a.repo.libraryId,
        bindingGeneration: 1,
        provider: "google-drive",
        accountId: "test",
        rootId: "test",
      },
      async candidates(h) {
        return objects.has(h) ? [objects.get(h)!] : [];
      },
      async create(h, b) {
        objects.set(h, b);
      },
      async enumerate() {
        return { revisionIds: [], cursor: "done", more: false };
      },
    };
    const sync = new NotesSynchronizer(a.repo, transport);
    expect(await sync.publish(100, held)).toBe(1);
    const jobs = await a.repo.jobs();
    expect(
      jobs
        .filter((j) => held.has(j.id))
        .every((j) => j.state === "pending" && j.attempts === 0)
    ).toBe(true);
    expect(await sync.publish(100)).toBe(1);
    expect((await a.repo.jobs()).every((j) => j.state === "verified")).toBe(
      true
    );
  });
  it("exports byte-identical named copies for an unchanged native history", async () => {
    const a = await fixture();
    await a.save("Retained text");
    const one = await exportNotes(a.repo, undefined, { nativeOnly: true });
    const two = await exportNotes(a.repo, undefined, { nativeOnly: true });
    expect(two.bytes).toEqual(one.bytes);
    expect(two.revisionIds).toEqual(one.revisionIds);
    const zipHeader = new DataView(
      one.bytes.buffer,
      one.bytes.byteOffset,
      one.bytes.byteLength
    );
    expect(zipHeader.getUint16(10, true)).toBe(0); // fixed local midnight, including outside UTC
    expect(zipHeader.getUint16(12, true)).toBe((20 << 9) | (1 << 5) | 1);
  });
  it("preserves projected nested folder names and rejects cycles", () => {
    const one = newId(),
      two = newId();
    const folders = [
      { id: one, name: "Maths", parentId: null, recovered: false },
      { id: two, name: "Complex numbers", parentId: one, recovered: false },
    ];
    expect(publicationPath(two, folders)).toEqual([
      { id: one, name: "Maths" },
      { id: two, name: "Complex numbers" },
    ]);
    folders[0].parentId = two as never;
    expect(() => publicationPath(two, folders)).toThrow("hierarchy");
  });
});

it("retries a failed large named-copy transfer without acknowledging it, uses bounded chunks, and skips unchanged successful copies", async () => {
  const a = await fixture(),
    view = await a.save("x".repeat(5 * 1024 * 1024), "Large synthetic note");
  const note = {
    id: a.d.documentId,
    view,
    updatedAt: new Date(0).toISOString(),
    preview: "",
    searchText: "",
  };
  const readable = new Uint8Array(5 * 1024 * 1024 + 22).fill(88);
  readable.set(new TextEncoder().encode("%PDF-1.7\n"));
  const publisher = new DrivePublications(a.repo, async () => readable);
  let starts = 0,
    reconciliations = 0,
    fail = true,
    total = 0,
    received = 0;
  const chunks: number[] = [],
    startsMetadata: {
      format: string;
      size: number;
      fingerprint: string;
      predecessor?: string;
    }[] = [];
  vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit = {}) => {
    if (String(_input).includes("action=inspect"))
      return Response.json({ copies: [] });
    if (
      init.headers &&
      new Headers(init.headers).get("Content-Type") === "application/json"
    ) {
      const p = JSON.parse(String(init.body));
      startsMetadata.push(p);
      if (received && received === total) {
        reconciliations++;
        return Response.json({ complete: true });
      }
      starts++;
      total = p.size;
      received = 0;
      return Response.json({ complete: false, token: "synthetic-upload" });
    }
    const part = new Uint8Array(init.body as ArrayBuffer);
    chunks.push(part.length);
    if (fail) {
      fail = false;
      return Response.json({ code: "NETWORK" }, { status: 503 });
    }
    received += part.length;
    return Response.json({ complete: received === total, offset: received });
  });
  await expect(publisher.publish(note, [])).rejects.toMatchObject({
    code: "NETWORK",
  });
  expect((await a.repo.jobs()).every((j) => j.state === "pending")).toBe(true);
  await publisher.publish(note, []);
  expect(starts).toBe(2);
  expect(reconciliations).toBe(1);
  expect(received).toBe(total);
  expect(total).toBeGreaterThan(4 * 1024 * 1024);
  expect(startsMetadata.at(-1)!.format).toBe("pdf");
  expect(chunks.every((n) => n <= 4 * 1024 * 1024)).toBe(true);
  await publisher.publish(note, []);
  expect(starts).toBe(2);
  const receipt = startsMetadata.at(-1)!.fingerprint;
  expect(await a.repo.publicationReceipt(note.id, "pdf")).toBe(receipt);
  // A cold publisher reconciles with Drive, while retaining its acknowledged predecessor.
  await new DrivePublications(a.repo, async () => readable).publish(note, []);
  expect(reconciliations).toBe(2);
  expect(startsMetadata.at(-1)!.predecessor).toBe(receipt);
  expect((await a.repo.jobs()).every((j) => j.state === "pending")).toBe(true);
  const isolated = await fixture();
  expect(
    await isolated.repo.publicationReceipt(note.id, "pdf")
  ).toBeUndefined();
});

it("keeps an untitled notebook local when all of its multiple pages are empty", async () => {
  const a = await fixture(),
    view = await a.save();
  const descriptor = structuredClone(view.descriptor),
    stream = { ...descriptor.streams[0], streamId: newId() };
  descriptor.kind = "notebook";
  descriptor.title = "Untitled notebook";
  descriptor.streams.push(stream);
  descriptor.pages = descriptor.streams.map((s) => ({
    pageId: newId(),
    streamId: s.streamId,
    width: 800,
    height: 1100,
    extensions: {},
  }));
  const empty = new Y.Doc();
  try {
    await a.repo.save({
      operationId: newId(),
      documentId: descriptor.documentId,
      parents: view.heads,
      descriptor,
      kind: "edit",
      updates: [
        {
          streamId: stream.streamId,
          epoch: 1,
          bytes: Y.encodeStateAsUpdate(empty),
        },
      ],
    });
  } finally {
    empty.destroy();
  }
  expect(
    await isLocalDraft(a.repo, await a.repo.document(descriptor.documentId))
  ).toBe(true);
});

it("derives copy retirement from reachable durable history, preserving unknown and equal-head snapshots", async () => {
  const a = await fixture(),
    first = await a.save("Original content", "Original title");
  await a.repo.save({
    operationId: newId(),
    documentId: a.d.documentId,
    parents: first.heads,
    descriptor: { ...first.descriptor, title: "Updated title" },
    kind: "edit",
    updates: [],
  });
  const view = await a.repo.document(a.d.documentId);
  const ancestor = "1".repeat(64),
    equal = "2".repeat(64),
    unrelated = "3".repeat(64);
  const metadata: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (String(input).includes("action=inspect"))
        return Response.json({
          copies: [
            { fingerprint: ancestor, heads: first.heads },
            { fingerprint: equal, heads: view.heads },
            { fingerprint: unrelated, heads: ["f".repeat(64)] },
          ],
        });
      metadata.push(JSON.parse(String(init.body)));
      return Response.json({ complete: true });
    }
  );
  await new DrivePublications(a.repo, async () =>
    new TextEncoder().encode("%PDF-1.7\nSynthetic readable note")
  ).publish(
    { id: a.d.documentId, view, updatedAt: "", preview: "", searchText: "" },
    [],
    undefined,
    true
  );
  expect(metadata[0].supersedes).toEqual([
    {
      fingerprint: ancestor,
      source: await digest(encodeJson([...first.heads].sort())),
    },
  ]);
  expect(metadata[0].heads).toEqual(view.heads);
  expect(metadata[0].recoveryVerified).toBe(true);
  expect((await a.repo.jobs()).every((j) => j.state === "pending")).toBe(true);
});

it("continues bounded cleanup on an unchanged note until maintenance is confirmed complete", async () => {
  const a = await fixture(),
    view = await a.save("A note", "History cleanup");
  let copies = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    if (String(input).includes("action=inspect"))
      return Response.json({ copies: [] });
    return Response.json({
      complete: true,
      maintenancePending: ++copies === 1,
    });
  });
  const publisher = new DrivePublications(a.repo, async () =>
    new TextEncoder().encode("%PDF-1.7\nReadable synthetic note")
  );
  const note = {
    id: a.d.documentId,
    view,
    updatedAt: "",
    preview: "",
    searchText: "",
  };
  await publisher.publish(note, []);
  await publisher.publish(note, []);
  await publisher.publish(note, []);
  expect(copies).toBe(2);
});

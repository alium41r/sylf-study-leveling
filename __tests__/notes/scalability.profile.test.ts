// @vitest-environment node
// Explicit profiling only; real encrypted repository + real Drive pack adapter, synthetic HTTP.
import "fake-indexeddb/auto";
import Dexie from "dexie";
import * as Y from "yjs";
import { it, expect, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import { digest } from "@/lib/notes/bytes";
import { createNotesVault } from "@/lib/notes/vault";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { NotesSynchronizer } from "@/lib/notes/sync";
import { GoogleDriveTransport } from "@/lib/notes/drive-transport";

it.runIf(!!process.env.NOTES_PROFILE_OUTPUT)(
  "profiles retained encrypted history, integrity and packed cloud reconstruction",
  async () => {
    const count = Number(process.env.NOTES_PROFILE_REVISIONS || 180),
      libraryId = newId();
    const progress = (stage: string, detail: unknown) =>
      writeFileSync(
        process.env.NOTES_PROFILE_OUTPUT! + ".progress.json",
        JSON.stringify({ stage, detail, at: new Date().toISOString() }, null, 2)
      );
    progress("starting", count);
    const sessions: NotesSession[] = [],
      repos: IndexedDbNotesRepository[] = [],
      names: string[] = [];
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
      verifiedAt: new Date().toISOString(),
      probeHash: "0".repeat(64),
    };
    const create = async () => {
      const session = new NotesSession("1", () => "1"),
        name = "notes-phase6-profile-" + newId();
      sessions.push(session);
      names.push(name);
      const cipher = await createNotesVault(
        new Uint8Array(32).fill(61),
        JSON.stringify(["1", libraryId]),
        session
      );
      const repo = new IndexedDbNotesRepository({
        session,
        libraryId,
        bindingGeneration: 1,
        databaseName: name,
        cipher,
      });
      repos.push(repo);
      await repo.registerLibrary(descriptor, binding);
      return repo;
    };
    const files = new Map<
      string,
      { id: string; hash: string; version: string; bytes: Uint8Array }
    >();
    let reads = 0,
      downloaded = 0,
      uploads = 0;
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      const url = new URL(input, "https://synthetic.test");
      const json = (v: unknown) =>
        new Response(JSON.stringify(v), {
          headers: { "content-type": "application/json" },
        });
      if (url.searchParams.get("action") === "upload") {
        const bytes = new Uint8Array(init.body as ArrayBuffer),
          hash = await digest(bytes),
          id = newId();
        expect(hash).toBe(url.searchParams.get("hash"));
        uploads++;
        files.set(id, { id, hash, version: "1", bytes });
        return json({ file: { id, hash, version: "1" } });
      }
      const body = JSON.parse(init.body as string);
      if (body.action === "list")
        return json({
          files: [...files.values()].map(({ id, hash, version }) => ({
            id,
            hash,
            version,
          })),
        });
      if (body.action === "read") {
        const bytes = files.get(body.fileId)!.bytes;
        reads++;
        if (reads % 100 === 0)
          progress("network reads", { reads, uploads, downloaded });
        downloaded += bytes.length;
        return new Response(bytes.slice().buffer);
      }
      throw new Error("Unexpected synthetic request");
    });
    const ydoc = new Y.Doc();
    try {
      const repo = await create(),
        documentId = newId(),
        streamId = newId();
      const scope = {
        ownerId: "1",
        libraryId,
        bindingGeneration: 1,
        provider: binding.provider,
        accountId: binding.accountId,
        rootId: binding.rootId,
      };
      const transport = new GoogleDriveTransport(scope, repo.session),
        sync = new NotesSynchronizer(repo, transport);
      let publishMs = 0,
        published = 0;
      const packEvery = Number(process.env.NOTES_PROFILE_PACK_EVERY || 0),
        batchSize = Number(process.env.NOTES_PROFILE_BATCH_SIZE || 100);
      const d: DocumentDescriptor = {
        format: "sylf-notes",
        formatVersion: 1,
        minimumReaderVersion: 1,
        libraryId,
        documentId,
        kind: "flow",
        title: "Retained history profile",
        schemaVersion: 1,
        streams: [
          {
            streamId,
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
      ydoc.getText("text").insert(0, "seed");
      let receipt = await repo.save({
        operationId: newId(),
        documentId,
        parents: [],
        descriptor: d,
        kind: "create",
        updates: [{ streamId, epoch: 1, bytes: Y.encodeStateAsUpdate(ydoc) }],
      });
      const view = await repo.document(documentId),
        times: number[] = [];
      let update: Uint8Array = new Uint8Array();
      ydoc.on("update", (bytes: Uint8Array) => {
        update = bytes;
      });
      for (let i = 1; i < count; i++) {
        ydoc.getText("text").insert(ydoc.getText("text").length, "x");
        const start = performance.now();
        receipt = await repo.save({
          operationId: newId(),
          documentId,
          parents: [receipt.revisionId],
          descriptor: view.descriptorRef,
          updates: [{ streamId, epoch: 1, bytes: update }],
        });
        times.push(performance.now() - start);
        if (i % 50 === 0) progress("saving", i);
        if (packEvery && (i + 1) % packEvery === 0) {
          const at = performance.now();
          for (;;) {
            const n = await sync.publish(batchSize);
            published += n;
            if (!n) break;
          }
          publishMs += performance.now() - at;
        }
      }
      progress("saved", count);
      const originalRead = repo.readObject.bind(repo),
        hashes = new Set<string>();
      let objectReads = 0;
      repo.readObject = async (hash) => {
        objectReads++;
        hashes.add(hash);
        return originalRead(hash);
      };
      const closureStart = performance.now(),
        closure = await repo.closure([receipt.revisionId]);
      const closureResult = {
        ms: performance.now() - closureStart,
        objectReads,
        uniqueHashes: hashes.size,
        objects: closure.length,
      };
      progress("closure", closureResult);
      objectReads = 0;
      hashes.clear();
      const auditStart = performance.now(),
        audit = process.env.NOTES_PROFILE_SKIP_AUDIT
          ? undefined
          : await repo.inspectIntegrity();
      const auditResult = {
        skipped: !audit,
        ms: performance.now() - auditStart,
        objectReads,
        uniqueHashes: hashes.size,
      };
      progress("audit", auditResult);
      if (audit) {
        expect(audit.issues).toEqual([]);
        expect(audit.recoverableHeads[documentId]).toEqual([
          receipt.revisionId,
        ]);
      }
      repo.readObject = originalRead;
      const finalPublishStart = performance.now();
      for (;;) {
        progress("publish batch", { published, reads, uploads });
        const n = await sync.publish(batchSize);
        published += n;
        if (!n) break;
      }
      publishMs += performance.now() - finalPublishStart;
      expect(published).toBe(count);
      progress("published", publishMs);
      reads = 0;
      downloaded = 0;
      const target = await create(),
        restore = new NotesSynchronizer(
          target,
          new GoogleDriveTransport(scope, target.session)
        );
      const restoreStart = performance.now();
      await restore.pull();
      const restored = await target.loadStream(documentId, streamId, 1);
      expect(restored.doc.getText("text").toString()).toBe(
        ydoc.getText("text").toString()
      );
      restored.doc.destroy();
      expect(await target.listRevisions(documentId)).toHaveLength(count);
      const sorted = [...times].sort((a, b) => a - b),
        tail = times.slice(-20).sort((a, b) => a - b);
      const result = {
        environment:
          "Node 24, fake IndexedDB, real AES-GCM/Yjs/repository/pack transport. Synthetic HTTP; zero live provider latency.",
        revisions: count,
        packEvery,
        batchSize,
        saves: {
          p50Ms: sorted[Math.floor(sorted.length * 0.5)],
          p95Ms: sorted[Math.floor(sorted.length * 0.95)],
          last20P95Ms: tail.at(-1),
        },
        closure: closureResult,
        integrity: auditResult,
        publish: { ms: publishMs, uploads, packs: files.size },
        restore: {
          ms: performance.now() - restoreStart,
          packReads: reads,
          downloadedBytes: downloaded,
          uniquePackBytes: [...files.values()].reduce(
            (n, f) => n + f.bytes.length,
            0
          ),
        },
        storage: await repo.storageStats(),
        heapUsed: process.memoryUsage().heapUsed,
      };
      writeFileSync(
        process.env.NOTES_PROFILE_OUTPUT!,
        JSON.stringify(result, null, 2)
      );
      console.log(JSON.stringify(result));
    } finally {
      ydoc.destroy();
      for (const s of sessions) s.close();
      for (const r of repos) r.close();
      for (const n of names) await Dexie.delete(n);
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    }
  },
  300000
);

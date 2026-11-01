// @vitest-environment node
/** Opt-in, read-only input: the explicitly authorized synthetic live-note export. */
import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Dexie from "dexie";
import { readStoredZip, importNotes } from "@/lib/notes/portable";
import { IndexedDbNotesRepository } from "@/lib/notes/repository";
import { NotesSession } from "@/lib/notes/session";
import { librarySchema, newId } from "@/lib/notes/contracts";
const file = process.env.NOTES_LIVE_TEST_ARCHIVE;
it.skipIf(!file)(
  "reconstructs the synthetic live-export native text/history in a separate empty repository",
  async () => {
    const bytes = new Uint8Array(readFileSync(file!));
    const zip = readStoredZip(bytes);
    const manifest = JSON.parse(
      new TextDecoder().decode(zip.get("manifest.json"))
    );
    const library = librarySchema.parse(manifest.library),
      session = new NotesSession(library.ownerRef, () => library.ownerRef);
    const name = "phase7-live-restore-" + newId();
    const repo = new IndexedDbNotesRepository({
      session,
      libraryId: library.libraryId,
      bindingGeneration: library.bindingGeneration,
      databaseName: name,
    });
    try {
      await repo.registerLibrary(library, {
        provider: "google-drive",
        accountId: "synthetic-restore",
        rootId: "synthetic-restore",
        generation: library.bindingGeneration,
        verifiedAt: new Date(0).toISOString(),
        probeHash: "0".repeat(64),
      });
      const restored = await importNotes(repo, bytes);
      expect(restored.state).not.toBe("read-only");
      expect(manifest.documents).toHaveLength(1);
      const view = await repo.document(manifest.documents[0]);
      expect(view.descriptor.title).toBe("Phase 7 — synthetic study notes");
      const stream = view.descriptor.streams[0];
      const loaded = await repo.loadStream(
        view.descriptor.documentId,
        stream.streamId,
        stream.epoch,
        view.heads
      );
      try {
        expect(loaded.doc.getXmlFragment("body").toString()).toContain(
          "Complex numbers: i squared equals minus one."
        );
      } finally {
        loaded.doc.destroy();
      }
      expect((await repo.listRevisions()).map((r) => r.id).sort()).toEqual(
        [...manifest.revisions].sort()
      );
      const result = {
        source: "authorized synthetic live UI export",
        archiveSHA256: createHash("sha256").update(bytes).digest("hex"),
        archiveBytes: bytes.length,
        documents: 1,
        originalRevisions: manifest.revisions.length,
        allNativeRevisionsPreserved: true,
        nativeTextReconstructed: true,
        cloudOnlyRecoveryVerified: false,
      };
      if (process.env.NOTES_LIVE_TEST_EVIDENCE)
        writeFileSync(
          process.env.NOTES_LIVE_TEST_EVIDENCE,
          JSON.stringify(result, null, 2) + "\n"
        );
    } finally {
      session.close();
      repo.close();
      await Dexie.delete(name);
    }
  }
);

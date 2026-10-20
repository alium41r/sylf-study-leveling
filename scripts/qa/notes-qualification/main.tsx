import * as Y from "yjs";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  IndexedDbNotesRepository,
  type FaultPoint,
} from "@/lib/notes/repository";
import { NotesStream, recoverUnacknowledged } from "@/lib/notes/engine";
import {
  createBrowserNotesSession,
  prepareNotesLogout,
} from "@/lib/notes/session";
import { clearClientCache } from "@/lib/client-data-cache";
import { newId, type DocumentDescriptor } from "@/lib/notes/contracts";
import {
  exportNotes,
  importNotes,
  inspectNotesArchive,
} from "@/lib/notes/portable";
import {
  initialRichTextUpdate,
  createNotesBlockNoteEditor,
} from "@/lib/notes/blocknote-adapter";
import { digest } from "@/lib/notes/bytes";

interface Config {
  database: string;
  owner: string;
  library: string;
  document: string;
  stream: string;
  richtext?: boolean;
  create?: boolean;
  seedSize?: number;
}
let repository: IndexedDbNotesRepository | undefined,
  stream: NotesStream | undefined;
let editor: Awaited<ReturnType<typeof createNotesBlockNoteEditor>> | undefined,
  root: Root | undefined;
let currentOwner = "",
  fault: FaultPoint | undefined,
  config: Config;
async function attach() {
  if (!repository) throw new Error("Initialize first");
  stream = await NotesStream.open(
    repository,
    config.document,
    config.stream,
    1
  );
  if (config.richtext) {
    editor = await createNotesBlockNoteEditor(stream);
    const { BlockNoteViewRaw } = await import("@blocknote/react");
    await import("@blocknote/core/style.css");
    await import("@blocknote/react/style.css");
    root = createRoot(document.getElementById("editor")!);
    root.render(
      <StrictMode>
        <BlockNoteViewRaw editor={editor.editor} />
      </StrictMode>
    );
  }
}
const api = {
  async init(input: Config) {
    if (!input.database.startsWith("sylf-notes-qualification-"))
      throw new Error("Disposable database prefix required");
    config = input;
    currentOwner = input.owner;
    const session = createBrowserNotesSession(
      input.owner,
      () => currentOwner === input.owner
    );
    repository = new IndexedDbNotesRepository({
      session,
      libraryId: input.library,
      bindingGeneration: 1,
      databaseName: input.database,
      fault: (point) => {
        if (point === fault)
          throw new DOMException(
            "Injected storage failure",
            "QuotaExceededError"
          );
      },
    });
    await repository.registerLibrary(
      {
        format: "sylf-notes",
        formatVersion: 1,
        minimumReaderVersion: 1,
        libraryId: input.library,
        ownerRef: input.owner,
        bindingGeneration: 1,
        extensions: {},
      },
      {
        provider: "google-drive",
        generation: 1,
        accountId: "synthetic-" + input.owner,
        rootId: "synthetic-root",
        verifiedAt: new Date(0).toISOString(),
        probeHash: "0".repeat(64),
      }
    );
    if (input.create === false) return;
    const existing = await repository.listDocumentIds();
    if (!existing.includes(input.document)) {
      const descriptor: DocumentDescriptor = {
        format: "sylf-notes",
        formatVersion: 1,
        minimumReaderVersion: 1,
        libraryId: input.library,
        documentId: input.document,
        kind: "flow",
        title: "Synthetic qualification",
        schemaVersion: 1,
        streams: [
          {
            streamId: input.stream,
            epoch: 1,
            codec: "yjs13-update-v1",
            adapter: input.richtext
              ? "blocknote/0.56.0"
              : "plain-text-qualification",
            schemaVersion: 1,
            projection: {
              root: input.richtext ? "body" : "text",
              type: input.richtext ? "xml" : "text",
            },
          },
        ],
        pages: [],
        assets: [],
        folderId: null,
        subjectId: null,
        requiredFeatures: [],
        extensions: {},
      };
      const doc = new Y.Doc();
      doc.getText("text").insert(0, "s".repeat(input.seedSize ?? 20));
      const bytes = input.richtext
        ? await initialRichTextUpdate("Rich text Ω اردو 日本語")
        : Y.encodeStateAsUpdate(doc);
      doc.destroy();
      await repository.save({
        operationId: newId(),
        documentId: input.document,
        parents: [],
        descriptor,
        kind: "create",
        updates: [{ streamId: input.stream, epoch: 1, bytes }],
      });
    }
    await attach();
  },
  append(value: string) {
    if (editor)
      editor.editor.insertBlocks(
        [
          {
            type: "paragraph",
            content: [{ type: "text", text: value, styles: { bold: true } }],
          },
        ],
        editor.editor.document.at(-1)!,
        "after"
      );
    else
      stream!.doc
        .getText("text")
        .insert(stream!.doc.getText("text").length, value);
  },
  flush: () => stream!.flush(),
  undo: () => editor!.editor.undo(),
  snapshot: () =>
    editor ? editor.editor.document : stream!.doc.getText("text").toString(),
  status: () => stream!.status(),
  stats: () => repository!.storageStats(),
  async checkpoint() {
    return repository!.checkpoint(config.document, config.stream, 1);
  },
  async reopen() {
    await stream!.flush();
    root?.unmount();
    root = undefined;
    editor?.close();
    editor = undefined;
    stream!.close();
    stream = undefined;
    const started = performance.now();
    await attach();
    return performance.now() - started;
  },
  setFault(point?: FaultPoint) {
    fault = point;
  },
  async persistedText() {
    const loaded = await repository!.loadStream(
      config.document,
      config.stream,
      1
    );
    try {
      return loaded.doc.getText("text").toString();
    } finally {
      loaded.doc.destroy();
    }
  },
  async portable() {
    const result = await exportNotes(repository!);
    return Array.from(result.bytes);
  },
  async import(bytes: number[]) {
    const result = await importNotes(repository!, Uint8Array.from(bytes));
    await attach();
    return result.state;
  },
  async inspect(bytes: number[]) {
    const result = await inspectNotesArchive(Uint8Array.from(bytes));
    return result.state === "supported"
      ? { state: result.state, projections: result.manifest.interchange.length }
      : { state: result.state };
  },
  logout: () => clearClientCache(),
  async explicitLogout() {
    await prepareNotesLogout(currentOwner);
    clearClientCache();
  },
  changeOwner(owner: string) {
    currentOwner = owner;
  },
  recover: () => recoverUnacknowledged(repository!),
  async asset() {
    const bytes = new Uint8Array(8 * 1024 * 1024 + 7);
    bytes[0] = 7;
    const asset = await repository!.stageAsset(
      bytes,
      "application/pdf",
      "synthetic.pdf"
    );
    return {
      parts: asset.content.parts.length,
      hashMatches:
        (await digest(await repository!.readContent(asset.content))) ===
        (await digest(bytes)),
      pending: (await repository!.pendingAssets()).length,
    };
  },
  async capabilities() {
    return {
      estimate: await navigator.storage.estimate(),
      persisted: await navigator.storage.persisted(),
      indexedDB: !!globalThis.indexedDB,
    };
  },
};
(window as unknown as { notesHarness: typeof api }).notesHarness = api;

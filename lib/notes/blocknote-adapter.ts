import * as Y from "yjs";
import type { NotesStream } from "./engine";
import { NotesError } from "./errors";

/** Browser-only editor adapter. Importing the foundation does not load BlockNote or its DOM dependencies. */
export async function createNotesBlockNoteEditor(
  stream: NotesStream,
  options: {
    uploadFile?: (file: File) => Promise<string>;
    resolveFileUrl?: (url: string) => Promise<string>;
  } = {}
) {
  if (typeof document === "undefined")
    throw new NotesError(
      "UNSUPPORTED",
      "The rich-text adapter needs a browser."
    );
  if (stream.adapterId !== "blocknote/0.56.0")
    throw new NotesError(
      "UNSUPPORTED",
      "This stream requires its original editor adapter."
    );
  const [{ BlockNoteEditor }, { withCollaboration }, { ReadOnlyExtension }] =
    await Promise.all([
      import("@blocknote/core"),
      import("@blocknote/core/yjs"),
      import("@blocknote/core/extensions"),
    ]);
  const editor = BlockNoteEditor.create(
    withCollaboration({
      ...options,
      collaboration: {
        fragment: stream.doc.getXmlFragment("body"),
        user: { name: "", color: "#666666" },
      },
    })
  );
  const readOnly = editor.getExtension(ReadOnlyExtension);
  if (!readOnly)
    throw new NotesError(
      "UNSUPPORTED",
      "The qualified editor durability lock is unavailable."
    );
  // Independent feature lock: React mounting must not override a failed/paused
  // stream, or remount the editor and reset its selection on each save.
  const applyState = (state: ReturnType<NotesStream["status"]>["state"]) => {
    readOnly.setReadOnly(
      state === "failed" || state === "closed" || state === "pausing",
      "sylf-durability"
    );
  };
  const remove = stream.subscribe(applyState);
  applyState(stream.status().state);
  return {
    editor,
    close: () => {
      remove();
      editor._tiptapEditor.destroy();
    },
  };
}

/** Explicit one-time creation only. Never run on ordinary open, reload, checkpoint or merge. */
export async function initialRichTextUpdate(text = ""): Promise<Uint8Array> {
  if (typeof document === "undefined")
    throw new NotesError(
      "UNSUPPORTED",
      "Initial rich-text conversion needs a browser."
    );
  const [{ BlockNoteEditor }, { blocksToYDoc }] = await Promise.all([
    import("@blocknote/core"),
    import("@blocknote/core/yjs"),
  ]);
  const editor = BlockNoteEditor.create(),
    doc = blocksToYDoc(editor, [{ type: "paragraph", content: text }], "body");
  try {
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
    editor._tiptapEditor.destroy();
  }
}

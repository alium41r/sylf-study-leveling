import { describe, expect, it } from "vitest";
import {
  documentSchema,
  newId,
  type DocumentDescriptor,
} from "@/lib/notes/contracts";
import { pageTextOrigin } from "@/lib/notes/page-layers";
function fixture(): DocumentDescriptor {
  const text = newId(),
    ink = newId();
  return {
    format: "sylf-notes",
    formatVersion: 1,
    minimumReaderVersion: 1,
    libraryId: newId(),
    documentId: newId(),
    kind: "notebook",
    title: "Mixed page",
    schemaVersion: 1,
    folderId: null,
    subjectId: null,
    streams: [
      {
        streamId: text,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "blocknote/0.56.0",
        schemaVersion: 1,
      },
      {
        streamId: ink,
        epoch: 1,
        codec: "yjs13-update-v1",
        adapter: "sylf-ink/1",
        schemaVersion: 1,
      },
    ],
    pages: [
      {
        pageId: newId(),
        streamId: text,
        width: 800,
        height: 1100,
        extensions: { textStreamId: text, inkStreamId: ink },
      },
    ],
    assets: [],
    requiredFeatures: ["page-layers-v1"],
    extensions: {},
  };
}
describe("versioned page layers", () => {
  it("requires explicit reader support for the two retained adapters", () => {
    const d = fixture();
    expect(documentSchema.safeParse(d).success).toBe(true);
    d.requiredFeatures = [];
    expect(documentSchema.safeParse(d).success).toBe(false);
  });
  it("rejects missing companion streams and swapped adapters", () => {
    const d = fixture();
    d.pages[0].extensions.inkStreamId = newId();
    expect(documentSchema.safeParse(d).success).toBe(false);
    d.pages[0].extensions.inkStreamId = d.streams[0].streamId;
    expect(documentSchema.safeParse(d).success).toBe(false);
  });
  it("clamps imported text geometry consistently for editor and print", () => {
    const page = fixture().pages[0];
    page.extensions.textOrigin = { x: -100, y: 90000 };
    expect(pageTextOrigin(page)).toEqual({ x: 20, y: 1020 });
    page.extensions.textOrigin = { x: "unsafe", y: null };
    expect(pageTextOrigin(page)).toEqual({ x: 64, y: 56 });
  });
});

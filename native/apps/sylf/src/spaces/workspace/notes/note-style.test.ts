import { describe, expect, it, vi } from "vitest";
import { notesContracts } from "@sylf/shared";
import { createMemoryStorage, createNotesLibrary, flowOf, DEVICE_OWNER } from "@sylf/notes";
import { DEFAULT_NOTE_STYLE, createOptions, noteStyle, stylePaper } from "./note-style";

vi.mock("@sylf/native-platform", () => ({ nativePreferences: () => undefined }));
const sha256 = async (bytes: Uint8Array) => (await import("node:crypto")).createHash("sha256").update(bytes).digest("hex");

describe("note style", () => {
  it("starts new notes in the chosen layout, spacing, paper, page flow and template, as the web schema accepts", async () => {
    const style = { ...DEFAULT_NOTE_STYLE, layout: "grid" as const, spacing: "wide" as const, paper: { color: "#f3faf6", rule: "#cfe3d8" }, flow: "endless" as const, template: "lecture" };
    expect(stylePaper(style)).toMatchObject({ template: "grid", spacing: 32, color: "#f3faf6", rule: "#cfe3d8" });
    const library = createNotesLibrary(createMemoryStorage(), DEVICE_OWNER, { sha256 });
    const handle = await library.open(await library.create(createOptions("note", style, "Linear algebra")));
    const descriptor = handle.descriptor();
    expect(descriptor.title).toBe("Linear algebra");
    expect(flowOf(descriptor)).toBe("endless");
    expect(notesContracts.documentSchema.safeParse(descriptor).success).toBe(true);
    const board = await library.open(await library.create(createOptions("board", { ...style, board: "grid" }, undefined)));
    expect(board.descriptor().title).toBe("Whiteboard");
  });

  it("keeps the choice and tells listeners", () => {
    const seen: string[] = [];
    const stop = noteStyle.subscribe(() => seen.push(noteStyle.get().layout));
    noteStyle.set({ layout: "dotted" });
    noteStyle.set({ layout: "ruled" });
    stop();
    expect(seen).toEqual(["dotted", "ruled"]);
  });
});

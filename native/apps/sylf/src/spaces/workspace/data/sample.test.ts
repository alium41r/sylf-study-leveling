import { describe, expect, it } from "vitest";
import { TOOL_IDS } from "@sylf/spaces";
import { EMPTY_WORKSPACE_DATA, SAMPLE_WORKSPACE_DATA, workspaceDataFor } from "./sample";

describe("Workspace data binding", () => {
  it("cannot show sample content without development tools", () => {
    expect(workspaceDataFor(false, null)).toBe(EMPTY_WORKSPACE_DATA);
    expect(workspaceDataFor(false, "sample")).toBe(EMPTY_WORKSPACE_DATA);
    expect(workspaceDataFor(true, "empty")).toBe(EMPTY_WORKSPACE_DATA);
    expect(workspaceDataFor(true, null)).toBe(SAMPLE_WORKSPACE_DATA);
  });

  it("marks every sample result as sample", async () => {
    const adapter = SAMPLE_WORKSPACE_DATA;
    const results = await Promise.all([adapter.notes(), adapter.pdfs(), adapter.boards(), adapter.sylvie(), adapter.sounds(), adapter.resources()]);
    for (const result of results) { expect(result.provenance).toBe("sample"); expect(result.data).toBeTruthy(); }
  });

  it("marks empty results as live and null", async () => {
    expect(await EMPTY_WORKSPACE_DATA.notes()).toEqual({ provenance: "live", data: null });
  });

  it("points every shelf entry at a document that exists", async () => {
    const [{ data: shelf }, { data: notes }, { data: pdfs }, { data: boards }] = await Promise.all([SAMPLE_WORKSPACE_DATA.resources(), SAMPLE_WORKSPACE_DATA.notes(), SAMPLE_WORKSPACE_DATA.pdfs(), SAMPLE_WORKSPACE_DATA.boards()]);
    for (const entry of shelf ?? []) {
      const pool = entry.kind === "note" ? notes : entry.kind === "pdf" ? pdfs : boards;
      expect(pool?.some((document) => document.id === entry.documentId)).toBe(true);
    }
  });


  it("knows eight tools, now that Planner and Calendar live in Home", () => { expect(TOOL_IDS).toHaveLength(8); expect(TOOL_IDS).not.toContain("planner"); expect(TOOL_IDS).not.toContain("calendar"); });
});

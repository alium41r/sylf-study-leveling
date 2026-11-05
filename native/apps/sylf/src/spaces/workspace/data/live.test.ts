import { describe, expect, it } from "vitest";
import { LIMITED_TOOLS } from "./live";

describe("Tools later work owns", () => {
  it("are none since Phase 14: Notes, PDFs, Whiteboard and Resources read the local library", () => {
    expect(Object.keys(LIMITED_TOOLS)).toEqual([]);
  });
});

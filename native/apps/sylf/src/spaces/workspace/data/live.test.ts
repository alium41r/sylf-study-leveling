import { describe, expect, it } from "vitest";
import { localDay } from "../../home/data/live";
import { LIMITED_TOOLS } from "./live";


describe("Tools later work owns", () => {
  it("are limited, with no data and no sample", () => {
    for (const view of ["notes", "pdfs", "boards", "resources"] as const) {
      expect(LIMITED_TOOLS[view]).toMatchObject({ provenance: "live", data: null });
      expect(LIMITED_TOOLS[view]?.limited).toBeTruthy();
    }
  });
});

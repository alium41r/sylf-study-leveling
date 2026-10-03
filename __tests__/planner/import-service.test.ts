// @vitest-environment node
import { describe, expect, it } from "vitest";
import { candidateFromImport, importErrorFor } from "@/lib/planner/import/service";
import { ScopeCandidateSchema, type ExtractionResult } from "@/lib/planner/research/contracts";
import { ScopeNodeSchema } from "@/lib/planner/intake/brief";

const extraction = (overrides: Partial<ExtractionResult> = {}): ExtractionResult => ({
  text: "Cells\nEnzymes\nPhotosynthesis",
  pages: [{ from: 1, to: 1 }],
  partial: false,
  partialReason: null,
  method: "TEXT",
  ...overrides,
});

const SIGNED_URL = "https://example.supabase.co/storage/v1/object/sign/planner-intake/1/s/tok";

describe("candidateFromImport", () => {
  it("turns a complete paste into a candidate with no public source and an honest summary", () => {
    const candidate = candidateFromImport({
      extraction: extraction(),
      origin: "PASTE",
      briefDigest: "digest-12345678",
      retrievedAt: "2025-01-01T00:00:00Z",
      source: null,
    });
    expect(candidate.origin).toBe("PASTE");
    expect(candidate.sources).toEqual([]);
    expect(candidate.status).toBe("OK");
    expect(candidate.confidence).toBe("HIGH");
    expect(candidate.provider).toBe("planner-import");
    expect(candidate.nodes).toHaveLength(3);
    expect(candidate.nodes.every((node) => node.selected)).toBe(true);
    expect(candidate.summary).toContain("3 units");
    expect(candidate.summary).toContain("the text you pasted");
    expect(candidate.summary).not.toContain("not read");
  });

  it("marks a partial extraction WEAK and raises a content-free open question", () => {
    const candidate = candidateFromImport({
      extraction: extraction({ partial: true, partialReason: "PAGES_UNREADABLE" }),
      origin: "IMPORT",
      briefDigest: "digest-12345678",
      retrievedAt: "2025-01-01T00:00:00Z",
      source: { url: SIGNED_URL, title: "syllabus.pdf" },
    });
    expect(candidate.status).toBe("WEAK");
    expect(candidate.confidence).toBe("MEDIUM");
    expect(candidate.openQuestions).toContain(
      "Some pages could not be read; check the list below for gaps."
    );
    expect(candidate.sources).toHaveLength(1);
    expect(candidate.sources[0].sourceType).toBe("USER_UPLOAD");
    expect(candidate.summary).toContain("not read");
  });

  it("turns an empty extraction into UNAVAILABLE with no nodes", () => {
    const candidate = candidateFromImport({
      extraction: extraction({ text: "", partial: true, partialReason: "NO_TEXT_LAYER" }),
      origin: "IMPORT",
      briefDigest: "digest-12345678",
      retrievedAt: "2025-01-01T00:00:00Z",
      source: { url: SIGNED_URL, title: "scan.pdf" },
    });
    expect(candidate.status).toBe("UNAVAILABLE");
    expect(candidate.confidence).toBe("LOW");
    expect(candidate.nodes).toEqual([]);
    // The uploaded file is still recorded as provenance, but it supports no nodes.
    expect(candidate.sources).toHaveLength(1);
    expect(candidate.sources[0].sourceType).toBe("USER_UPLOAD");
    expect(candidate.sources[0].nodeIds).toEqual([]);
  });

  it("maps extraction reasons to the failure codes the caller reports", () => {
    expect(importErrorFor("NO_TEXT_LAYER")).toBe("IMPORT_UNSUPPORTED");
    expect(importErrorFor("ENCRYPTED")).toBe("IMPORT_UNSUPPORTED");
    expect(importErrorFor("UNPARSEABLE")).toBe("IMPORT_FAILED");
    expect(importErrorFor("VISION_UNAVAILABLE")).toBe("IMPORT_FAILED");
    expect(importErrorFor("PAGE_LIMIT")).toBe("IMPORT_PARTIAL");
    expect(importErrorFor("TEXT_LIMIT")).toBe("IMPORT_PARTIAL");
    expect(importErrorFor("PAGES_UNREADABLE")).toBe("IMPORT_PARTIAL");
    expect(importErrorFor("NO_OUTLINE_DETECTED")).toBe("IMPORT_EMPTY");
    expect(importErrorFor("")).toBe("IMPORT_EMPTY"); // empty text
    expect(importErrorFor(null)).toBe("IMPORT_FAILED");
    expect(importErrorFor("SOMETHING_ELSE")).toBe("IMPORT_FAILED");
  });

  it("infers nothing about preparedness, confidence, priority or mastery", () => {
    const candidate = candidateFromImport({
      extraction: extraction(),
      origin: "PASTE",
      briefDigest: "digest-12345678",
      retrievedAt: "2025-01-01T00:00:00Z",
      source: null,
    });

    // The strict candidate schema rejects any unknown top-level key, so a preparedness,
    // priority or mastery claim could not have sneaked in unnoticed.
    expect(ScopeCandidateSchema.safeParse(candidate).success).toBe(true);
    expect("preparedness" in candidate).toBe(false);
    expect("priority" in candidate).toBe(false);
    expect("mastery" in candidate).toBe(false);

    // A ScopeNode carries exactly the five contract fields — no preparedness or rating.
    for (const node of candidate.nodes) {
      expect(Object.keys(node).sort()).toEqual(["kind", "label", "nodeId", "parentId", "selected"]);
      expect(ScopeNodeSchema.safeParse(node).success).toBe(true);
    }
  });
});

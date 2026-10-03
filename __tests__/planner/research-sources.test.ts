// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  buildSource,
  classifySource,
  dedupeSources,
  officialDomainsFor,
  publisherFromUrl,
  rankSources,
  sourceTypeIsOfficial,
  sourceTypeLabel,
} from "@/lib/planner/research/sources";
import type { ResearchSource } from "@/lib/planner/research/contracts";

describe("publisherFromUrl", () => {
  it("returns the host, lowercased, with www stripped", () => {
    expect(publisherFromUrl("https://www.CambridgeInternational.org/programmes/9231")).toBe(
      "cambridgeinternational.org",
    );
    expect(publisherFromUrl("http://example.com/x")).toBe("example.com");
  });

  it("returns null for unparseable input rather than guessing", () => {
    expect(publisherFromUrl("not a url")).toBeNull();
    expect(publisherFromUrl("")).toBeNull();
  });
});

describe("officialDomainsFor", () => {
  it("derives a known board's hosts from the registry", () => {
    const domains = officialDomainsFor({ board: "CAIE" });
    expect(domains).toContain("cambridgeinternational.org");
    expect(domains).toContain("cie.org.uk");
  });

  it("returns none for an unknown board, never assuming a domain", () => {
    expect(officialDomainsFor({ goal: "A-Level Mathematics", board: "Made Up Board", level: null })).toEqual([]);
    expect(officialDomainsFor({ board: null, level: null })).toEqual([]);
  });

  it("resolves a board from the level only when the level names one", () => {
    expect(officialDomainsFor({ board: null, level: "IB HL" })).toContain("ibo.org");
    expect(officialDomainsFor({ board: null, level: "GCSE" })).toEqual([]);
  });
});

describe("classifySource", () => {
  const caie = { goal: "A-Level Mathematics", board: "CAIE", level: "A-Level" };

  it("marks an official-domain PDF as OFFICIAL_PDF", () => {
    expect(classifySource("https://cambridgeinternational.org/9231/syllabus.pdf", caie)).toBe(
      "OFFICIAL_PDF",
    );
    // The /pdf/ segment also reads as a document, not a landing page.
    expect(classifySource("https://cambridgeinternational.org/pdf/spec", caie)).toBe(
      "OFFICIAL_PDF",
    );
  });

  it("marks an official-domain page as OFFICIAL, including subdomains", () => {
    expect(
      classifySource("https://www.cambridgeinternational.org/programmes-and-qualifications", caie),
    ).toBe("OFFICIAL");
    expect(classifySource("https://assets.cambridgeinternational.org/logo.png", caie)).toBe(
      "OFFICIAL",
    );
  });

  it("marks government and university hosts as INSTITUTIONAL, never OFFICIAL for another body's exam", () => {
    // This is the rule Phase 2 got wrong: `.gov` and `.edu` are evidence of an
    // institution, not of *the* institution that owns a given syllabus, and calling
    // them official lends the wrong document the authority of the right one.
    expect(classifySource("https://data.gov.uk/dataset/x", caie)).toBe("INSTITUTIONAL");
    expect(classifySource("https://mit.edu/course/6", caie)).toBe("INSTITUTIONAL");
    expect(classifySource("https://www.ox.ac.uk/study", caie)).toBe("INSTITUTIONAL"); // .ac.uk
  });

  it("keeps a prep blog SECONDARY even when the URL text claims to be official", () => {
    // Content-looking-right is not evidence: the words "official" and
    // "specification" in the path do not confer authority on a blog host.
    expect(classifySource("https://prep-blog.com/official-syllabus-caie", caie)).toBe(
      "SECONDARY",
    );
    expect(classifySource("https://prep-blog.com/specification/9231.pdf", caie)).toBe(
      "SECONDARY",
    );
  });
});

describe("dedupeSources", () => {
  it("collapses www/fragment/trailing-slash variants, keeps the query, preserves order", () => {
    const sources = [
      { url: "https://www.cambridgeinternational.org/a/", title: "One" },
      { url: "https://cambridgeinternational.org/a", title: "One" },
      { url: "https://cambridgeinternational.org/a#section", title: "One" },
      { url: "https://cambridgeinternational.org/b?page=2", title: "Two" },
      { url: "https://cambridgeinternational.org/b", title: "Three" },
    ];
    // The query string differs, so the last two are distinct documents.
    expect(dedupeSources(sources).map((s) => s.url)).toEqual([
      "https://www.cambridgeinternational.org/a/",
      "https://cambridgeinternational.org/b?page=2",
      "https://cambridgeinternational.org/b",
    ]);
  });

  it("collapses entries whose titles and hosts are identical", () => {
    const sources = [
      { url: "https://cambridgeinternational.org/a?utm=1", title: "Same Title" },
      { url: "https://cambridgeinternational.org/a?utm=2", title: "Same Title" },
      { url: "https://cambridgeinternational.org/c", title: "Different" },
    ];
    expect(dedupeSources(sources).map((s) => s.url)).toEqual([
      "https://cambridgeinternational.org/a?utm=1",
      "https://cambridgeinternational.org/c",
    ]);
  });
});

describe("rankSources", () => {
  const src = (over: Partial<ResearchSource>): ResearchSource => ({
    sourceId: "src-1",
    url: "https://example.com/a",
    title: null,
    publisherOrDomain: "example.com",
    sourceType: "SECONDARY",
    retrievedAt: "2026-01-01T00:00:00.000Z",
    documentDate: null,
    nodeIds: [],
    mappingConfidence: "LOW",
    ...over,
  });

  it("is deterministic and total: same data sorts identically from any input order", () => {
    const sources = [
      src({ sourceId: "src-1", url: "https://z.com/a", publisherOrDomain: "z.com" }),
      src({ sourceId: "src-2", url: "https://a.com/b", publisherOrDomain: "a.com" }),
      src({ sourceId: "src-3", url: "https://m.com/c", publisherOrDomain: "m.com" }),
    ];
    const sorted = rankSources(sources);
    expect(rankSources([...sources].reverse())).toEqual(sorted);
    expect(rankSources(sorted)).toEqual(sorted);
  });

  it("orders by source type, then confidence", () => {
    const secondary = src({ sourceId: "s", sourceType: "SECONDARY" });
    const official = src({ sourceId: "o", sourceType: "OFFICIAL", mappingConfidence: "MEDIUM" });
    const pdf = src({ sourceId: "p", sourceType: "OFFICIAL_PDF" });
    const officialLow = src({ sourceId: "ol", sourceType: "OFFICIAL", mappingConfidence: "LOW" });
    const officialHigh = src({ sourceId: "oh", sourceType: "OFFICIAL", mappingConfidence: "HIGH" });
    expect(
      rankSources([secondary, officialLow, pdf, official, officialHigh]).map((s) => s.sourceId),
    ).toEqual(["p", "oh", "o", "ol", "s"]);
  });

  it("breaks remaining ties by node count, publisher, then URL", () => {
    const a = src({ sourceId: "a", publisherOrDomain: "alpha.com", url: "https://alpha.com/1", nodeIds: ["n1", "n2"] });
    const b = src({ sourceId: "b", publisherOrDomain: "beta.com", url: "https://beta.com/1", nodeIds: ["n1", "n2", "n3"] });
    const c = src({ sourceId: "c", publisherOrDomain: "alpha.com", url: "https://alpha.com/2", nodeIds: ["n1", "n2"] });
    // Same type/confidence: b (3 nodes) leads; then alpha.com, then URL order.
    expect(rankSources([c, a, b]).map((s) => s.sourceId)).toEqual(["b", "a", "c"]);
  });
});

describe("buildSource", () => {
  const ctx = { goal: "A-Level Mathematics", board: "CAIE", level: null };

  it("derives a deterministic id from the normalised URL and the provenance from the host", () => {
    const url = "https://cambridgeinternational.org/9231/syllabus.pdf";
    const source = buildSource({
      url,
      title: "9231 Syllabus (2026)",
      context: ctx,
      retrievedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(source).not.toBeNull();
    // Cross-checked against node:crypto in the TEST only (the module itself is
    // pure JS and client-importable): the id is the first 16 hex of sha256(url).
    const expectedId = `src-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
    expect(source!.sourceId).toBe(expectedId);
    expect(source!.publisherOrDomain).toBe("cambridgeinternational.org");
    expect(source!.sourceType).toBe("OFFICIAL_PDF");
    expect(source!.documentDate).toBe("2026");
    expect(source!.nodeIds).toEqual([]);
    expect(source!.mappingConfidence).toBe("LOW");
  });

  it("returns null for a bad URL and never invents one", () => {
    expect(buildSource({ url: "not a url", title: null, context: ctx, retrievedAt: "x" })).toBeNull();
    expect(buildSource({ url: "ftp://example.com/a.pdf", title: null, context: ctx, retrievedAt: "x" })).toBeNull();
    expect(
      buildSource({ url: `https://example.com/${"a".repeat(3000)}`, title: null, context: ctx, retrievedAt: "x" }),
    ).toBeNull();
  });

  it("reads an explicit year from the title, but never a syllabus code as a year", () => {
    const withBare = buildSource({
      url: "https://aqa.org.uk/x.pdf",
      title: "Specification 2025",
      context: ctx,
      retrievedAt: "x",
    });
    expect(withBare!.documentDate).toBe("2025");
    const withCode = buildSource({
      url: "https://aqa.org.uk/x.pdf",
      title: "9231 Further Mathematics",
      context: ctx,
      retrievedAt: "x",
    });
    expect(withCode!.documentDate).toBeNull();
  });
});

describe("source type copy", () => {
  it("labels are plain words, never a colour", () => {
    expect(sourceTypeLabel("OFFICIAL")).toBe("Official");
    expect(sourceTypeLabel("OFFICIAL_PDF")).toBe("Official PDF");
    expect(sourceTypeLabel("SECONDARY")).toBe("Secondary");
    expect(sourceTypeLabel("USER_UPLOAD")).toBe("Your upload");
  });

  it("only recognised-authority types count as official", () => {
    expect(sourceTypeIsOfficial("OFFICIAL")).toBe(true);
    expect(sourceTypeIsOfficial("OFFICIAL_PDF")).toBe(true);
    expect(sourceTypeIsOfficial("SECONDARY")).toBe(false);
    expect(sourceTypeIsOfficial("USER_UPLOAD")).toBe(false);
  });
});

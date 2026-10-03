// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ConfirmedScopeSourceSchema,
  ResearchSourceSchema,
  type ResearchSource,
  type ScopeCandidate,
} from "@/lib/planner/research/contracts";
import { confirmedScopeSources } from "@/lib/planner/research/service";
import { buildSource, sourceTypeIsOfficial } from "@/lib/planner/research/sources";
import { emptyBrief, PlanBriefV1Schema, type ScopeNode } from "@/lib/planner/intake/brief";

/**
 * UX Phase 3.1, issue two: a confirmed scope must be able to resolve the provenance it
 * claims, after the candidate it came from has been cleared.
 *
 * These are the selection rules, asserted directly: only referenced sources travel, the
 * copy is exact and content-free, an impossible reference is dropped rather than
 * invented, a user upload never gains a public address, and the bound is the existing
 * source ceiling.
 */

const context = { goal: "NUST NET Engineering", subject: null, board: "CAIE", level: "A-Level" };

const source = (url: string, title: string | null = null): ResearchSource =>
  buildSource({ url, title, context, retrievedAt: "2030-01-05T00:00:00.000Z" })!;

const OFFICIAL = source("https://www.cambridgeinternational.org/spec-9709.pdf", "Cambridge 9709");
const INSTITUTIONAL = source("https://www.ox.ac.uk/study/mathematics", "Oxford mathematics");
const SECONDARY = source("https://prep-blog.example/net-guide", "NET preparation guide");

const node = (
  nodeId: string,
  label: string,
  sourceIds?: string[]
): ScopeNode => ({
  nodeId,
  label,
  kind: "TOPIC",
  parentId: null,
  selected: true,
  ...(sourceIds?.length ? { sourceIds } : {}),
});

const candidate = (over: {
  sources: ResearchSource[];
  nodes?: ScopeNode[];
  origin?: ScopeCandidate["origin"];
}): ScopeCandidate =>
  ({
    version: 1,
    origin: over.origin ?? "RESEARCH",
    status: "OK",
    confidence: "MEDIUM",
    briefDigest: "digest",
    retrievedAt: "2030-01-05T00:00:00.000Z",
    provider: "deepseek-search",
    cacheKey: "key",
    nodes: over.nodes ?? [node("n1", "Matrices"), node("n2", "Sequences"), node("n3", "Dynamics")],
    sources: over.sources,
    openQuestions: [],
    failureCode: null,
    summary: "Found three units.",
  }) as ScopeCandidate;

describe("confirmed scope provenance: only referenced sources travel", () => {
  it("keeps what the confirmed nodes cite, and drops what they do not", () => {
    const built = {
      ...candidate({
        sources: [OFFICIAL, INSTITUTIONAL, SECONDARY],
        nodes: [
          node("n1", "Matrices", [OFFICIAL.sourceId]),
          node("n2", "Sequences", [INSTITUTIONAL.sourceId]),
          node("n3", "Dynamics"),
        ],
      }),
    };
    const kept = confirmedScopeSources(built, built.nodes);
    expect(kept.provenanceRefs).toEqual([OFFICIAL.sourceId, INSTITUTIONAL.sourceId]);
    expect(kept.provenanceSources.map((source) => source.sourceId)).toEqual([
      OFFICIAL.sourceId,
      INSTITUTIONAL.sourceId,
    ]);
    // The third source was read but nothing in the confirmed scope points at it.
    expect(kept.provenanceSources).not.toContainEqual(
      expect.objectContaining({ sourceId: SECONDARY.sourceId })
    );
  });

  it("drops a source whose node was not confirmed", () => {
    const built = candidate({
      sources: [OFFICIAL, INSTITUTIONAL],
      nodes: [node("n1", "Matrices", [OFFICIAL.sourceId]), node("n2", "Sequences", [INSTITUTIONAL.sourceId])],
    });
    // Only n1 survived the review.
    const kept = confirmedScopeSources(built, [built.nodes[0]]);
    expect(kept.provenanceRefs).toEqual([OFFICIAL.sourceId]);
  });

  it("honours the mapping an import records the other way round", () => {
    /**
     * An upload's source lists the nodes it produced (`nodeIds`), while the nodes carry
     * no `sourceIds` at all. Reading only one direction would lose the upload's
     * provenance entirely.
     */
    const upload = source("https://upload.sylf.local/syllabus", "my-syllabus.pdf");
    const built = candidate({
      origin: "IMPORT",
      sources: [{ ...upload, sourceType: "USER_UPLOAD", nodeIds: ["n1", "n2"] }],
      nodes: [node("n1", "Matrices"), node("n2", "Sequences")],
    });
    const kept = confirmedScopeSources(built, built.nodes);
    expect(kept.provenanceRefs).toEqual([upload.sourceId]);
    expect(kept.provenanceSources[0].sourceType).toBe("USER_UPLOAD");
  });

  it("drops an impossible reference instead of inventing the record it names", () => {
    const built = candidate({
      sources: [OFFICIAL],
      // A node citing an id the candidate never held: nothing to resolve, nothing kept.
      nodes: [node("n1", "Matrices", ["src-that-never-existed"])],
    });
    const kept = confirmedScopeSources(built, built.nodes);
    // The fallback applies: nothing referenced means the material read is the provenance.
    expect(kept.provenanceRefs).toEqual([OFFICIAL.sourceId]);
    expect(kept.provenanceSources[0].sourceId).toBe(OFFICIAL.sourceId);
  });

  it("keeps the material read when nothing is referenced at all", () => {
    // A candidate whose nodes cite nothing still came from somewhere; leaving the
    // confirmation with refs that resolve to nothing is the defect being closed.
    const built = candidate({ sources: [OFFICIAL, SECONDARY], nodes: [node("n1", "Matrices")] });
    const kept = confirmedScopeSources(built, built.nodes);
    expect(kept.provenanceRefs).toEqual([OFFICIAL.sourceId, SECONDARY.sourceId]);
  });

  it("deduplicates and stays inside the existing source bound", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      source(`https://www.cambridgeinternational.org/spec-${index}.pdf`, `Spec ${index}`)
    );
    const cited = [many[0].sourceId, many[1].sourceId, many[0].sourceId];
    const built = candidate({
      sources: many,
      nodes: [node("n1", "Matrices", cited), node("n2", "Sequences")],
    });
    const kept = confirmedScopeSources(built, built.nodes);
    // Two distinct ids cited, however many times they were cited.
    expect(kept.provenanceRefs).toEqual([many[0].sourceId, many[1].sourceId]);

    const everything = candidate({ sources: many, nodes: [node("n1", "Matrices")] });
    const bounded = confirmedScopeSources(everything, everything.nodes);
    expect(bounded.provenanceRefs).toHaveLength(8);
    expect(bounded.provenanceSources).toHaveLength(8);
  });

  it("copies the record exactly, and copies no content", () => {
    const built = candidate({
      sources: [OFFICIAL, INSTITUTIONAL],
      nodes: [node("n1", "Matrices", [OFFICIAL.sourceId, INSTITUTIONAL.sourceId])],
    });
    const kept = confirmedScopeSources(built, built.nodes);
    const official = kept.provenanceSources[0];
    expect(official).toEqual({
      sourceId: OFFICIAL.sourceId,
      url: OFFICIAL.url,
      title: OFFICIAL.title,
      publisherOrDomain: OFFICIAL.publisherOrDomain,
      sourceType: OFFICIAL.sourceType,
      retrievedAt: OFFICIAL.retrievedAt,
      documentDate: OFFICIAL.documentDate,
    });
    // The one field deliberately dropped: the node mapping already lives on the nodes,
    // and carrying it twice would be the only field able to threaten the brief ceiling.
    expect(JSON.stringify(kept.provenanceSources)).not.toMatch(/nodeIds|mappingConfidence/);
    // And nothing that could only have come from page content or a model.
    expect(JSON.stringify(kept.provenanceSources)).not.toMatch(/<html|snippet|excerpt|prompt/i);
  });

  it("preserves a user upload with no public address claimed for it", () => {
    const upload = source("https://upload.sylf.local/syllabus", "my-syllabus.pdf");
    const built = candidate({
      origin: "IMPORT",
      sources: [{ ...upload, sourceType: "USER_UPLOAD", publisherOrDomain: null }],
      nodes: [{ ...node("n1", "Matrices"), sourceIds: [upload.sourceId] }],
    });
    const kept = confirmedScopeSources(built, built.nodes);
    expect(kept.provenanceSources[0].sourceType).toBe("USER_UPLOAD");
    // The student's own file is never promoted to an authority, and never given an author.
    expect(sourceTypeIsOfficial(kept.provenanceSources[0].sourceType)).toBe(false);
    expect(kept.provenanceSources[0].publisherOrDomain).toBeNull();
  });

  it("keeps a paste with no source at all empty rather than inventing one", () => {
    const built = candidate({ origin: "PASTE", sources: [], nodes: [node("n1", "Matrices")] });
    expect(confirmedScopeSources(built, built.nodes)).toEqual({
      provenanceRefs: [],
      provenanceSources: [],
    });
  });
});

describe("confirmed scope provenance: the brief stays compatible and bounded", () => {
  it("parses a brief written before this field existed, without inventing sources", () => {
    const legacy = emptyBrief("EXAM") as Record<string, unknown>;
    const scope = legacy.scope as Record<string, unknown>;
    delete scope.provenanceSources;
    // An old confirmed scope kept its refs and nothing else.
    scope.source = "RESEARCH_CONFIRMED";
    scope.confirmedAt = "2030-01-01T00:00:00.000Z";
    scope.provenanceRefs = ["src-old-a", "src-old-b"];
    const parsed = PlanBriefV1Schema.parse(legacy);
    expect(parsed.scope.provenanceRefs).toEqual(["src-old-a", "src-old-b"]);
    // Absent means "no source retained" — which is the truth about that session, and the
    // alternative (inventing records for those ids) would be fabrication.
    expect(parsed.scope.provenanceSources).toEqual([]);
  });

  it("cannot hold more confirmed sources than the brief's own bound", () => {
    const record = {
      sourceId: "src-1",
      url: "https://www.cambridgeinternational.org/spec.pdf",
      title: "Spec",
      publisherOrDomain: "cambridgeinternational.org",
      sourceType: "OFFICIAL_PDF" as const,
      retrievedAt: "2030-01-05T00:00:00.000Z",
      documentDate: null,
    };
    expect(ConfirmedScopeSourceSchema.safeParse(record).success).toBe(true);
    // Unknown keys are refused, so a richer record cannot smuggle content in.
    expect(ConfirmedScopeSourceSchema.safeParse({ ...record, text: "page body" }).success).toBe(false);
    const brief = emptyBrief("EXAM");
    brief.scope.provenanceSources = Array.from({ length: 9 }, (_, index) => ({
      ...record,
      sourceId: `src-${index}`,
    }));
    expect(PlanBriefV1Schema.safeParse(brief).success).toBe(false);
  });

  it("keeps the confirmed record smaller than the research record it came from", () => {
    const full = JSON.stringify(ResearchSourceSchema.parse({ ...OFFICIAL, nodeIds: Array.from({ length: 200 }, (_, index) => `node-${index}`) }));
    const kept = confirmedScopeSources(
      candidate({ sources: [OFFICIAL], nodes: [node("n1", "Matrices", [OFFICIAL.sourceId])] }),
      [node("n1", "Matrices", [OFFICIAL.sourceId])]
    );
    const snapshot = JSON.stringify(kept.provenanceSources);
    console.log("source record bytes: research", full.length, "confirmed", snapshot.length);
    expect(snapshot.length).toBeLessThan(full.length / 4);
  });
});

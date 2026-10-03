// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { emptyBrief } from "@/lib/planner/intake/brief";
import {
  candidateIsStale,
  candidateFromResearch,
  parseFindingsIntoNodes,
  researchBriefDigest,
  researchCacheKey,
  reusableCandidate,
} from "@/lib/planner/research/service";
import { buildSource } from "@/lib/planner/research/sources";

/**
 * The research service's judgement calls.
 *
 * These are the rules that keep Phase 2 honest, so they are asserted directly rather
 * than through a provider call: when is a result official, when is it merely weak, when
 * is it stale, and — the one that matters most — how does a candidate with no real
 * source end up with no source at all instead of a plausible-looking one.
 */

/**
 * A brief with a stated board, because that is what makes an official domain
 * recognisable: without it, no host can be classified official, and research can only
 * ever report something weak. That is a real product dependency, not a test detail.
 */
const brief = (over: Partial<ReturnType<typeof emptyBrief>> = {}) => ({
  ...emptyBrief("EXAM"),
  goal: { title: "NUST NET Engineering" },
  target: { endDate: "2030-02-04", examDate: "2030-02-04" },
  backgroundCurriculum: { label: "A-Level Mathematics", level: "A-Level", board: "CAIE" },
  ...over,
});

const source = (url: string, title: string | null = null) =>
  buildSource({ url, title, context: { goal: "A-Level Mathematics", board: "CAIE", level: "A-Level" }, retrievedAt: "2030-01-07T00:00:00.000Z" })!;

const request = (b: ReturnType<typeof brief>) => ({
  briefDigest: researchBriefDigest(b),
  goal: b.goal.title,
  subject: b.subject.name,
  board: b.backgroundCurriculum?.board ?? null,
  level: b.backgroundCurriculum?.level ?? null,
  mode: b.mode,
});

describe("research service: status is earned, never assumed", () => {
  it("is OK only with a real official source and usable findings", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "# Algebra\n- Quadratics\n- Sequences",
      sources: [{ url: "https://www.cambridgeinternational.org/programmes/spec.pdf", title: "Specification" }],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "k1",
    });
    expect(candidate.status).toBe("OK");
    expect(candidate.sources).toHaveLength(1);
    expect(candidate.sources[0].sourceType).toBe("OFFICIAL_PDF");
    expect(candidate.nodes.length).toBeGreaterThan(0);
  });

  it("is WEAK when the only sources are secondary", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "# Algebra\n- Quadratics",
      sources: [{ url: "https://someprepblog.example/syllabus", title: "Syllabus" }],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "k1",
    });
    expect(candidate.status).toBe("WEAK");
    expect(candidate.sources[0].sourceType).toBe("SECONDARY");
    // The student is told, in words, that nothing official was found.
    expect(candidate.openQuestions.join(" ")).toMatch(/official source/i);
    expect(candidate.summary).toMatch(/not official/i);
  });

  it("is WEAK when the provider answered without searching, even if the prose looks right", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "# Algebra\n- Quadratics",
      sources: [],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: true,
      cacheKey: "k1",
    });
    expect(candidate.status).toBe("WEAK");
    expect(candidate.sources).toEqual([]);
    expect(candidate.openQuestions.join(" ")).toMatch(/from what I already know/i);
  });

  it("is WEAK when grounded findings arrive with no citable source, and never invents one", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "# Algebra\n- Quadratics",
      sources: [],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "k1",
    });
    expect(candidate.sources).toEqual([]);
    expect(candidate.status).toBe("WEAK");
    // No source at all is described as exactly that — not as "a source that is not
    // official", which would imply a source was found.
    expect(candidate.summary).toMatch(/could not find a source/i);
    expect(candidate.summary).not.toMatch(/a source that is not official/i);
    expect(candidate.openQuestions.join(" ")).toMatch(/official source/i);
  });

  it("drops a claim whose url cannot be a real source rather than keeping it", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "- Cells",
      sources: [
        { url: "not a url", title: "made up" },
        { url: "javascript:alert(1)", title: "nope" },
        { url: "https://www.cambridgeinternational.org/spec.pdf", title: "Spec" },
      ],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "k1",
    });
    expect(candidate.sources).toHaveLength(1);
    expect(candidate.sources[0].url).toBe("https://www.cambridgeinternational.org/spec.pdf");
  });

  it("keeps every node citing the sources that support the answer, bounded", () => {
    const candidate = candidateFromResearch({
      request: request(brief()),
      findings: "- Cells\n- Enzymes",
      sources: [
        { url: "https://www.cambridgeinternational.org/a.pdf", title: "A" },
        { url: "https://www.cambridgeinternational.org/b.pdf", title: "B" },
        { url: "https://www.cambridgeinternational.org/c.pdf", title: "C" },
        { url: "https://www.cambridgeinternational.org/d.pdf", title: "D" },
        { url: "https://www.cambridgeinternational.org/e.pdf", title: "E" },
      ],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: "k1",
    });
    // More than four sources is allowed on the candidate; each node cites at most four.
    expect(candidate.sources.length).toBe(5);
    for (const node of candidate.nodes) expect(node.sourceIds!.length).toBeLessThanOrEqual(4);
  });
});

describe("research service: findings become a hierarchy, deterministically", () => {
  it("reads markdown headings as sections and chapters, and bullets as topics", () => {
    const nodes = parseFindingsIntoNodes(
      "# Algebra\n## Quadratics\n- Factorising\n- Completing the square\n# Geometry\n- Circles",
      []
    );
    expect(nodes.map((node) => [node.kind, node.label])).toEqual([
      ["SECTION", "Algebra"],
      ["CHAPTER", "Quadratics"],
      ["TOPIC", "Factorising"],
      ["TOPIC", "Completing the square"],
      ["SECTION", "Geometry"],
      ["TOPIC", "Circles"],
    ]);
    // Parents are wired to the nearest shallower node.
    const quadratics = nodes.find((node) => node.label === "Quadratics")!;
    const algebra = nodes.find((node) => node.label === "Algebra")!;
    expect(quadratics.parentId).toBe(algebra.nodeId);
    expect(nodes.find((node) => node.label === "Circles")!.parentId).toBe(
      nodes.find((node) => node.label === "Geometry")!.nodeId
    );
  });

  it("is deterministic: the same findings produce the same node ids", () => {
    const text = "# Algebra\n- Quadratics\n- Sequences";
    expect(parseFindingsIntoNodes(text, [])).toEqual(parseFindingsIntoNodes(text, []));
  });

  it("drops a line that carries no wording instead of labelling it", () => {
    const nodes = parseFindingsIntoNodes("-\n- \n# \n- Cells", []);
    expect(nodes.map((node) => node.label)).toEqual(["Cells"]);
  });

  it("clamps deeper nesting to the engine's three levels rather than dropping it", () => {
    const nodes = parseFindingsIntoNodes("#### Deep\n- Still here", []);
    expect(nodes.every((node) => node.kind !== "SECTION" || node.parentId === null)).toBe(true);
    expect(nodes.length).toBe(2);
  });
});

describe("research service: a candidate knows which brief and question it answers", () => {
  it("treats an edited goal as a different brief, so the old answer is stale", () => {
    const before = brief();
    const after = brief({ goal: { title: "NUST NET Business" } } as never);
    expect(researchBriefDigest(before)).not.toBe(researchBriefDigest(after));
    const candidate = candidateFromResearch({
      request: request(before),
      findings: "- Algebra",
      sources: [{ url: "https://www.cambridgeinternational.org/spec.pdf", title: null }],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: researchCacheKey({
        goal: before.goal.title,
        subject: null,
        board: null,
        level: null,
        mode: "EXAM",
      }),
    });
    expect(candidateIsStale(candidate, before)).toBe(false);
    expect(candidateIsStale(candidate, after)).toBe(true);
  });

  it("reuses a candidate only for the same question about the same brief", () => {
    const b = brief();
    const key = researchCacheKey({ goal: b.goal.title, subject: null, board: null, level: null, mode: "EXAM" });
    const candidate = candidateFromResearch({
      request: request(b),
      findings: "- Algebra",
      sources: [{ url: "https://www.cambridgeinternational.org/spec.pdf", title: null }],
      retrievedAt: "2030-01-07T00:00:00.000Z",
      provider: "google-search-grounding",
      ungrounded: false,
      cacheKey: key,
    });
    const withCandidate = { ...b, scopeCandidate: candidate } as typeof b;
    expect(reusableCandidate(withCandidate, key)).not.toBeNull();
    // A different question about the same brief is not a cache hit.
    expect(reusableCandidate(withCandidate, "different-key")).toBeNull();
    // …and the same question against a changed brief is not either.
    const edited = { ...withCandidate, goal: { title: "Something else" } } as typeof b;
    expect(reusableCandidate(edited, key)).toBeNull();
  });

  it("keys the cache on normalised wording, so casing and spacing do not re-search", () => {
    const a = researchCacheKey({ goal: " NUST   NET Engineering ", subject: null, board: null, level: null, mode: "EXAM" });
    const b = researchCacheKey({ goal: "nust net engineering", subject: null, board: null, level: null, mode: "EXAM" });
    expect(a).toBe(b);
  });
});

describe("research service: it never writes to the brief", () => {
  it("returns a candidate and leaves the confirmed scope untouched", async () => {
    // The two network seams are stubbed — search and the model — so the *real* research
    // loop runs. That is stronger than mocking the old provider: this now covers the
    // path that actually ships, and still asserts the property that matters, that a
    // successful run cannot reach the confirmed scope.
    const searchModule = await import("@/lib/planner/research/search/provider");
    const searchSpy = vi
      .spyOn(searchModule, "selectSearchProvider")
      .mockReturnValue({
        id: "brave",
        search: async () => [
          {
            url: "https://cambridgeinternational.org/spec.pdf",
            title: "Specification",
            snippet: null,
            rank: 1,
            provider: "brave",
          },
        ],
      });
    const fetchModule = await import("@/lib/planner/research/search/fetch");
    const fetchSpy = vi.spyOn(fetchModule, "fetchSource").mockResolvedValue({
      finalUrl: "https://cambridgeinternational.org/spec.pdf",
      contentType: "application/pdf",
      text: "# Algebra\n- Quadratics\n- Sequences",
      partial: false,
      partialReason: null,
      bytes: 100,
    requests: 1,
    });
    const deepseek = await import("@/lib/planner/research/deepseek");
    const modelSpy = vi.spyOn(deepseek, "deepseekModel").mockReturnValue({
      planResearch: async () => ({
        plan: {
          depth: "STANDARD" as const,
          objectives: [{ id: "o1", question: "What does the syllabus cover?", priority: "PRIMARY" as const }],
          queries: [
            { query: "CAIE A Level Mathematics syllabus", purpose: "OFFICIAL_SYLLABUS" as const, objectiveId: "o1" },
          ],
        },
        usage: { inputTokens: 10, outputTokens: 10, calls: 1 },
      }),
      planQueries: async () => ({
        plan: { queries: [{ query: "CAIE A Level Mathematics syllabus", purpose: "OFFICIAL_SYLLABUS" }] },
        usage: { inputTokens: 10, outputTokens: 10, calls: 1 },
      }),
      planFollowUp: async () => ({ plan: { queries: [] }, usage: { inputTokens: 10, outputTokens: 10, calls: 1 } }),
      extract: async ({ sources }: { sources: { sourceId: string; text: string }[] }) => ({
        extraction: {
          targetIdentity: { name: "A-Level Mathematics", institution: null, board: "CAIE", level: "A-Level" },
          scope: [
            { label: "Algebra", kind: "CHAPTER", parentIndex: null },
            { label: "Quadratics", kind: "TOPIC", parentIndex: 0 },
          ],
          sourceMappings: [],
          unresolved: [],
          extractionConfidence: "HIGH",
          conflicts: [],
        },
        // Phase 2: `OK` requires verified evidence, so the double quotes the page it was given.
        claims: sources.slice(0, 1).map((source) => ({
          objectiveId: "o1",
          sourceId: source.sourceId,
          statement: "The specification covers Algebra and Quadratics.",
          excerpt: source.text,
          evidenceKind: "DIRECT",
          support: "SUPPORTS",
          documentDate: null,
        })),
        usage: { inputTokens: 10, outputTokens: 10, calls: 1 },
      }),
    });

    const { researchScope } = await import("@/lib/planner/research/service");
    const b = brief();
    const frozen = JSON.stringify(b);
    const outcome = await researchScope({ brief: b });
    expect(outcome.candidate.nodes.length).toBeGreaterThan(0);
    expect(outcome.metrics.status).toBe("OK");
    expect(outcome.metrics.cacheHit).toBe(false);
    // The brief object is exactly as it was: research proposes, it does not apply.
    expect(JSON.stringify(b)).toBe(frozen);
    expect(b.scope.nodes).toEqual([]);
    expect(b.scopeCandidate).toBeNull();
    searchSpy.mockRestore();
    fetchSpy.mockRestore();
    modelSpy.mockRestore();
  });

  it("refuses to look anything up when the student said to use only their own material", async () => {
    const provider = await import("@/lib/planner/research/deepseek");
    const spy = vi.spyOn(provider, "deepseekModel");
    const { researchScope } = await import("@/lib/planner/research/service");
    const outcome = await researchScope({ brief: brief(), disabled: true });
    expect(spy).not.toHaveBeenCalled();
    expect(outcome.candidate.status).toBe("UNAVAILABLE");
    expect(outcome.candidate.failureCode).toBe("RESEARCH_NOT_APPLICABLE");
    expect(outcome.candidate.summary).toMatch(/only what you give it/i);
    spy.mockRestore();
  });

  it("has nothing to research before the student has named what they are preparing for", async () => {
    const provider = await import("@/lib/planner/research/deepseek");
    const spy = vi.spyOn(provider, "deepseekModel");
    const { researchScope } = await import("@/lib/planner/research/service");
    const outcome = await researchScope({ brief: emptyBrief("EXAM") });
    expect(spy).not.toHaveBeenCalled();
    expect(outcome.candidate.failureCode).toBe("RESEARCH_NOT_APPLICABLE");
    spy.mockRestore();
  });
});

describe("research sources are typed by host, never by wording", () => {
  it("never promotes a blog to official because the words look right", () => {
    const blog = source("https://best-prep-blog.example/official-syllabus-specification-2026.pdf");
    expect(blog.sourceType).toBe("SECONDARY");
  });

  it("keeps publisher and retrieval time for the student to judge", () => {
    const spec = source("https://www.cambridgeinternational.org/programmes/spec.pdf", "Syllabus 2026");
    expect(spec.publisherOrDomain).toBe("cambridgeinternational.org");
    expect(spec.retrievedAt).toBe("2030-01-07T00:00:00.000Z");
    // A document date is only claimed when the title actually carries one.
    expect(spec.documentDate).toBe("2026");
  });
});

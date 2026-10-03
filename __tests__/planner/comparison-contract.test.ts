// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  COMPARISON_DISCLAIMER,
  COMPARISON_LIMITS,
  CurriculumComparisonSchema,
  OVERLAP_CONFIDENCES,
  OVERLAP_EXPLANATION_CODES,
  OVERLAP_REVIEW_ORDER,
  OVERLAP_STATES,
  applyOverlapCorrections,
  comparisonSummarySentence,
  coverageSuggestionRefs,
  overlapCounts,
  unitsInReviewOrder,
  type ComparisonUnit,
  type CurriculumComparison,
  type OverlapCorrection,
} from "@/lib/planner/comparison/contracts";
import {
  ResearchExtractionSchema,
  ComparisonExtractionSchema,
  type ComparisonExtraction,
} from "@/lib/planner/research/search/contracts";
import {
  COMPARISON_PROVIDER_VERSION,
  backgroundDigest,
  comparisonFromExtraction,
  comparisonIsStale,
  reusableComparison,
  targetScopeDigest,
  comparisonTargets,
} from "@/lib/planner/research/comparison";
import { buildSource } from "@/lib/planner/research/sources";
import { emptyBrief, type PlanBriefV1, type ScopeNode } from "@/lib/planner/intake/brief";

/**
 * The comparison contract, asserted as rules rather than as shapes.
 *
 * The four overlap states, the strict schema, and — most importantly — the four
 * refusals: no preparedness field exists, a citation the server did not issue is
 * dropped, an assertion with no evidence becomes UNCLEAR, and a result that no longer
 * matches the scope or the background is never reused.
 */

const node = (
  nodeId: string,
  label: string,
  kind: ScopeNode["kind"],
  parentId: string | null,
  selected = true
): ScopeNode => ({ nodeId, label, kind, parentId, selected });

/** The NUST NET / CAIE A-Level reference scenario. */
function brief(over: Partial<PlanBriefV1> = {}): PlanBriefV1 {
  const base = emptyBrief("EXAM");
  base.goal.title = "NUST NET Engineering";
  base.target = { endDate: "2030-06-01", examDate: "2030-06-01" };
  base.backgroundCurriculum = {
    label: "CAIE A-Level",
    level: "A-Level",
    board: "CAIE",
    subjects: ["Mathematics", "Physics", "Computer Science"],
  };
  base.scope = {
    source: "RESEARCH_CONFIRMED",
    confirmedAt: "2030-01-02T00:00:00.000Z",
    provenanceRefs: ["src-net"],
    provenanceSources: [],
    removedLabels: [],
    nodes: [
      node("s1", "Mathematics", "SECTION", null),
      node("c1", "Algebra", "CHAPTER", "s1"),
      node("t1", "Matrices", "TOPIC", "c1"),
      node("t2", "Sequences and series", "TOPIC", "c1"),
      node("c2", "Calculus", "CHAPTER", "s1"),
      node("t3", "Differentiation", "TOPIC", "c2"),
    ],
  };
  return { ...base, ...over };
}

/**
 * The Cambridge specification, as a real source.
 *
 * Note that its `sourceId` is *derived from its URL* rather than chosen: that is the
 * provenance rule Phase 2.1 established, and it is why a citation only counts when it
 * names an id the server actually issued.
 */
const withSource = (url: string, title = "Cambridge International AS & A Level Mathematics 9709") =>
  buildSource({
    url,
    title,
    context: { goal: "CAIE A-Level", board: "CAIE", level: "A-Level" },
    retrievedAt: "2030-01-03T00:00:00.000Z",
  })!;

const OFFICIAL = withSource("https://www.cambridgeinternational.org/spec-9709.pdf");
const OFFICIAL_ID = OFFICIAL.sourceId;

const extraction = (units: ComparisonExtraction["units"]): ComparisonExtraction => ({
  backgroundUnits: [{ label: "Pure Mathematics 1" }],
  units,
  unresolved: [],
  comparisonConfidence: "MEDIUM",
});

const comparison = (units: ComparisonUnit[], background = brief()): CurriculumComparison =>
  comparisonFromExtraction({
    brief: background,
    extraction: extraction(
      units.map((unit) => ({
        unitRef: unit.unitRef,
        overlap: unit.overlap === "UNCLEAR" ? "UNCLEAR" : unit.overlap,
        confidence: unit.confidence,
        sourceIds: unit.sourceIds,
        explanationCode: unit.explanationCode === "STUDENT_CORRECTION" ? "BACKGROUND_TOPIC_MATCH" : unit.explanationCode,
      }))
    ),
    sources: [OFFICIAL],
    retrievedAt: "2030-01-03T00:00:00.000Z",
    searchProvider: "brave",
    outputChars: 0,
  }).comparison;

describe("comparison: the overlap vocabulary is exactly four states", () => {
  it("has no fifth state and no preparedness field in any row", () => {
    expect(OVERLAP_STATES).toEqual([
      "LIKELY_COVERED_BY_CURRICULUM",
      "PARTIAL_OVERLAP",
      "LIKELY_NEW_TO_CURRICULUM",
      "UNCLEAR",
    ]);
    // A row that carries a preparedness answer cannot even be parsed: there is no field
    // for it, and the schema is strict. This is the structural half of "comparison may
    // never imply mastery".
    const unit = {
      unitRef: "t1",
      overlap: "LIKELY_COVERED_BY_CURRICULUM",
      confidence: "HIGH",
      sourceIds: [],
      explanationCode: "BACKGROUND_TOPIC_MATCH",
      covered: true,
    };
    expect(() => CurriculumComparisonSchema.shape.units.element.parse(unit)).toThrow();
  });

  it("orders the review uncertainty-first and collapses the likely-covered rows last", () => {
    expect(OVERLAP_REVIEW_ORDER[0]).toBe("UNCLEAR");
    expect(OVERLAP_REVIEW_ORDER.at(-1)).toBe("LIKELY_COVERED_BY_CURRICULUM");
    const ordered = unitsInReviewOrder([
      { unitRef: "a", overlap: "LIKELY_COVERED_BY_CURRICULUM", confidence: "HIGH", sourceIds: [], explanationCode: "BACKGROUND_TOPIC_MATCH" },
      { unitRef: "b", overlap: "UNCLEAR", confidence: "LOW", sourceIds: [], explanationCode: "EVIDENCE_INCONCLUSIVE" },
      { unitRef: "c", overlap: "LIKELY_NEW_TO_CURRICULUM", confidence: "MEDIUM", sourceIds: ["s"], explanationCode: "NOT_IN_BACKGROUND_CURRICULUM" },
    ]);
    expect(ordered.map((unit) => unit.unitRef)).toEqual(["b", "c", "a"]);
  });

  it("says what it compares, once, in words that are about curricula", () => {
    expect(COMPARISON_DISCLAIMER).toMatch(/not how well you personally know it/);
    // No verb anywhere in the disclaimer claims knowledge.
    expect(COMPARISON_DISCLAIMER).not.toMatch(/master|confiden|remember|secure/i);
  });

  it("keeps every explanation code in the closed list", () => {
    for (const code of OVERLAP_EXPLANATION_CODES) expect(typeof code).toBe("string");
    expect(OVERLAP_EXPLANATION_CODES).not.toContain("MODEL_PROSE");
    expect(OVERLAP_CONFIDENCES).toEqual(["HIGH", "MEDIUM", "LOW"]);
  });
});

describe("comparison: a source is never invented and evidence is never assumed", () => {
  it("has no URL field in the model's output schema", () => {
    const withUrl = {
      backgroundUnits: [],
      units: [
        {
          unitRef: "t1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "HIGH",
          sourceIds: [],
          explanationCode: "BACKGROUND_TOPIC_MATCH",
          url: "https://evil.example/syllabus",
        },
      ],
      unresolved: [],
      comparisonConfidence: "HIGH",
    };
    // A model-composed URL has nowhere to land: the schema is strict and has no such key.
    expect(ComparisonExtractionSchema.safeParse(withUrl).success).toBe(false);
    expect(JSON.stringify(ComparisonExtractionSchema.shape)).not.toContain("url");
  });

  it("drops a citation the server never issued", () => {
    const built = comparisonFromExtraction({
      brief: brief(),
      extraction: extraction([
        {
          unitRef: "t1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "HIGH",
          sourceIds: [OFFICIAL_ID, "src-invented"],
          explanationCode: "BACKGROUND_TOPIC_MATCH",
        },
      ]),
      sources: [OFFICIAL],
      retrievedAt: "2030-01-03T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    const matrices = built.comparison.units.find((unit) => unit.unitRef === "t1")!;
    expect(matrices.sourceIds).toEqual([OFFICIAL_ID]);
    expect(built.droppedCitations).toBe(1);
  });

  it("turns an uncited assertion into UNCLEAR rather than believing it", () => {
    const built = comparisonFromExtraction({
      brief: brief(),
      extraction: extraction([
        {
          unitRef: "t1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "HIGH",
          sourceIds: [],
          explanationCode: "BACKGROUND_TOPIC_MATCH",
        },
      ]),
      sources: [OFFICIAL],
      retrievedAt: "2030-01-03T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    expect(built.downgraded).toBe(1);
    expect(built.comparison.units.find((unit) => unit.unitRef === "t1")!.overlap).toBe("UNCLEAR");
    expect(built.comparison.units.find((unit) => unit.unitRef === "t1")!.explanationCode).toBe(
      "EVIDENCE_INCONCLUSIVE"
    );
  });

  it("reports a unit the model omitted as UNCLEAR, never as absent", () => {
    const built = comparison(
      [
        {
          unitRef: "t1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "HIGH",
          sourceIds: [OFFICIAL_ID],
          explanationCode: "BACKGROUND_TOPIC_MATCH",
        },
      ]
    );
    // Every compared unit has a row: four units in this scope.
    expect(built.units).toHaveLength(comparisonTargets(brief()).length);
    const missing = built.units.find((unit) => unit.unitRef === "t3")!;
    expect(missing.overlap).toBe("UNCLEAR");
    expect(missing.explanationCode).toBe("NO_BACKGROUND_EVIDENCE");
  });

  it("drops a unit reference the model invented", () => {
    const built = comparison([
      {
        unitRef: "t-does-not-exist",
        overlap: "LIKELY_COVERED_BY_CURRICULUM",
        confidence: "HIGH",
        sourceIds: [OFFICIAL_ID],
        explanationCode: "BACKGROUND_TOPIC_MATCH",
      },
    ]);
    expect(built.units.map((unit) => unit.unitRef)).not.toContain("t-does-not-exist");
  });

  it("earns OK from an authoritative source, and settles for WEAK without one", () => {
    const secondary = withSource("https://prep-blog.example/caie-topics", "CAIE topic list");
    const withOfficial = comparison([
      {
        unitRef: "t1",
        overlap: "LIKELY_COVERED_BY_CURRICULUM",
        confidence: "HIGH",
        sourceIds: [OFFICIAL_ID],
        explanationCode: "BACKGROUND_TOPIC_MATCH",
      },
    ]);
    expect(withOfficial.status).toBe("OK");

    const weak = comparisonFromExtraction({
      brief: brief(),
      extraction: extraction([
        {
          unitRef: "t1",
          overlap: "LIKELY_COVERED_BY_CURRICULUM",
          confidence: "MEDIUM",
          sourceIds: [secondary.sourceId],
          explanationCode: "BACKGROUND_TOPIC_MATCH",
        },
      ]),
      sources: [secondary],
      retrievedAt: "2030-01-03T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    expect(weak.comparison.status).toBe("WEAK");
  });

  /**
   * Phase 3.1: an INSTITUTIONAL source is credible but is *not* verified as the authority
   * for this target, so it can never earn the comparison an `OK`. The rows keep their
   * classifications and citations — the evidence is not thrown away — and the status
   * honestly reports that the answer is usable but unverified.
   */
  describe("only a verified authority earns OK", () => {
    const institutional = withSource("https://www.ox.ac.uk/study/mathematics", "Oxford mathematics");
    const secondary = withSource("https://prep-blog.example/caie-topics", "CAIE topic list");

    /** One asserted unit citing exactly the given sources. */
    const assertedFrom = (sources: { sourceId: string }[]) =>
      comparisonFromExtraction({
        brief: brief(),
        extraction: extraction([
          {
            unitRef: "t1",
            overlap: "LIKELY_COVERED_BY_CURRICULUM",
            confidence: "HIGH",
            sourceIds: sources.map((source) => source.sourceId),
            explanationCode: "BACKGROUND_TOPIC_MATCH",
          },
        ]),
        sources: sources as never,
        retrievedAt: "2030-01-03T00:00:00.000Z",
        searchProvider: "brave",
        outputChars: 0,
      });

    it("classifies the fixtures the way the authority registry does", () => {
      // The rule under test depends on the registry's own classification, so it is
      // asserted rather than assumed: no source type was changed to make this pass.
      expect(institutional.sourceType).toBe("INSTITUTIONAL");
      expect(secondary.sourceType).toBe("SECONDARY");
      expect(OFFICIAL.sourceType).toBe("OFFICIAL_PDF");
    });

    it("earns OK from OFFICIAL_PDF evidence", () => {
      expect(assertedFrom([OFFICIAL]).comparison.status).toBe("OK");
    });

    it("earns OK from OFFICIAL evidence", () => {
      const official = withSource("https://www.cambridgeinternational.org/programmes/9709", "9709 home");
      expect(official.sourceType).toBe("OFFICIAL");
      expect(assertedFrom([official]).comparison.status).toBe("OK");
    });

    it("settles for WEAK with INSTITUTIONAL evidence alone, and keeps the row", () => {
      const built = assertedFrom([institutional]);
      expect(built.comparison.status).toBe("WEAK");
      const row = built.comparison.units.find((unit) => unit.unitRef === "t1")!;
      // The institutional evidence is still used, cited and shown.
      expect(row.overlap).toBe("LIKELY_COVERED_BY_CURRICULUM");
      expect(row.sourceIds).toEqual([institutional.sourceId]);
      expect(built.comparison.sources.map((source) => source.sourceId)).toEqual([
        institutional.sourceId,
      ]);
    });

    it("settles for WEAK with SECONDARY evidence alone", () => {
      expect(assertedFrom([secondary]).comparison.status).toBe("WEAK");
    });

    it("settles for WEAK when INSTITUTIONAL and SECONDARY are combined", () => {
      // Two non-authoritative sources do not add up to one authority.
      expect(assertedFrom([institutional, secondary]).comparison.status).toBe("WEAK");
    });

    it("is not upgraded by the model's own confidence", () => {
      const built = comparisonFromExtraction({
        brief: brief(),
        extraction: {
          ...extraction([
            {
              unitRef: "t1",
              overlap: "LIKELY_COVERED_BY_CURRICULUM",
              confidence: "HIGH",
              sourceIds: [institutional.sourceId],
              explanationCode: "BACKGROUND_TOPIC_MATCH",
            },
          ]),
          // The model's self-assessment is advisory by construction, and this is the
          // case that would otherwise be tempting: HIGH confidence, no authority.
          comparisonConfidence: "HIGH",
        },
        sources: [institutional] as never,
        retrievedAt: "2030-01-03T00:00:00.000Z",
        searchProvider: "brave",
        outputChars: 0,
      });
      expect(built.comparison.status).toBe("WEAK");
      expect(built.comparison.units[0].confidence).toBe("HIGH");
    });

    it("says the weakness out loud rather than only in an enum", () => {
      const built = assertedFrom([institutional]);
      expect(built.comparison.summary).toMatch(/examination authority/);
      const strong = assertedFrom([OFFICIAL]);
      expect(strong.comparison.summary).not.toMatch(/examination authority/);
    });

    it("still reports UNCLEAR for an uncited assertion, whatever the source set", () => {
      const built = assertedFrom([OFFICIAL]);
      expect(built.comparison.units.find((unit) => unit.unitRef === "t1")!.overlap).toBe(
        "LIKELY_COVERED_BY_CURRICULUM"
      );
      const uncited = comparisonFromExtraction({
        brief: brief(),
        extraction: extraction([
          {
            unitRef: "t1",
            overlap: "LIKELY_COVERED_BY_CURRICULUM",
            confidence: "HIGH",
            sourceIds: [],
            explanationCode: "BACKGROUND_TOPIC_MATCH",
          },
        ]),
        sources: [OFFICIAL] as never,
        retrievedAt: "2030-01-03T00:00:00.000Z",
        searchProvider: "brave",
        outputChars: 0,
      });
      expect(uncited.comparison.units.find((unit) => unit.unitRef === "t1")!.overlap).toBe("UNCLEAR");
      // With nothing asserted, there is no usable comparison at all.
      expect(uncited.comparison.status).toBe("UNAVAILABLE");
    });

    it("is WEAK, not OK, when official sources were read but no asserted unit cites one", () => {
      /**
       * §3's second `WEAK` case: official evidence exists but is insufficient for the
       * asserted comparison. Here the page was read and is authoritative, and the
       * assertion still rests on the institutional page alone.
       */
      const built = comparisonFromExtraction({
        brief: brief(),
        extraction: extraction([
          {
            unitRef: "t1",
            overlap: "LIKELY_COVERED_BY_CURRICULUM",
            confidence: "HIGH",
            sourceIds: [institutional.sourceId],
            explanationCode: "BACKGROUND_TOPIC_MATCH",
          },
        ]),
        sources: [OFFICIAL, institutional] as never,
        retrievedAt: "2030-01-03T00:00:00.000Z",
        searchProvider: "brave",
        outputChars: 0,
      });
      expect(built.comparison.status).toBe("WEAK");
      expect(built.comparison.sources).toHaveLength(2);
    });
  });

  /**
   * §14/§15 of the final phase: three failures, three codes.
   *
   * A live run is what forced the distinction. With the pages read and the extraction
   * schema-valid, a comparison in which every unit came back `UNCLEAR` was recorded as
   * `COMPARISON_MODEL_BAD_OUTPUT` — a code that says the model misbehaved, when the model
   * had in fact declined to assert an overlap the pages did not support. The student-facing
   * copy was already right; the *record* was not, and a quality review reading it would
   * have chased a model bug that did not exist.
   */
  it("distinguishes 'nothing could be asserted' from 'the model's answer was unusable'", () => {
    const empty = comparisonFromExtraction({
      brief: brief(),
      extraction: extraction([
        {
          unitRef: "t1",
          overlap: "UNCLEAR",
          confidence: "LOW",
          sourceIds: [],
          explanationCode: "EVIDENCE_INCONCLUSIVE",
        },
      ]),
      sources: [OFFICIAL],
      retrievedAt: "2030-01-03T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    expect(empty.comparison.status).toBe("UNAVAILABLE");
    // The evidence was read and the answer was well-formed; nothing could be settled.
    expect(empty.comparison.failureCode).toBe("COMPARISON_NOT_ASSERTED");
    // Coverage is still complete: every unit has an honest UNCLEAR row.
    expect(empty.comparison.units).toHaveLength(comparisonTargets(brief()).length);
    // …and the sentence the student reads says that, rather than blaming the model.
    expect(empty.comparison.summary).toMatch(/none of them settles any topic/i);
  });

  it("keeps COMPARISON_FETCH_FAILED for a run that read no page at all", () => {
    const nothing = comparisonFromExtraction({
      brief: brief(),
      extraction: extraction([
        { unitRef: "t1", overlap: "UNCLEAR", confidence: "LOW", sourceIds: [], explanationCode: "NO_BACKGROUND_EVIDENCE" },
      ]),
      sources: [],
      retrievedAt: "2030-01-03T00:00:00.000Z",
      searchProvider: "brave",
      outputChars: 0,
    });
    expect(nothing.comparison.status).toBe("UNAVAILABLE");
    expect(nothing.comparison.failureCode).toBe("COMPARISON_FETCH_FAILED");
  });
});

describe("comparison: staleness and caching", () => {
  it("is stale when the target scope changes", () => {
    const built = comparison([
      {
        unitRef: "t1",
        overlap: "LIKELY_COVERED_BY_CURRICULUM",
        confidence: "HIGH",
        sourceIds: [OFFICIAL_ID],
        explanationCode: "BACKGROUND_TOPIC_MATCH",
      },
    ]);
    expect(comparisonIsStale(built, brief())).toBe(false);
    const renamed = brief();
    renamed.scope.nodes = renamed.scope.nodes.map((entry) =>
      entry.nodeId === "t1" ? { ...entry, label: "Matrices and transformations" } : entry
    );
    // A renamed unit is a different question, so the answer no longer applies.
    expect(targetScopeDigest(renamed)).not.toBe(targetScopeDigest(brief()));
    expect(comparisonIsStale(built, renamed)).toBe(true);
  });

  it("is stale when the background curriculum changes", () => {
    const built = comparison([
      {
        unitRef: "t1",
        overlap: "LIKELY_COVERED_BY_CURRICULUM",
        confidence: "HIGH",
        sourceIds: [OFFICIAL_ID],
        explanationCode: "BACKGROUND_TOPIC_MATCH",
      },
    ]);
    const changed = brief();
    changed.backgroundCurriculum = {
      label: "FSc Pre-Engineering",
      level: "Intermediate",
      board: "FBISE",
      subjects: ["Mathematics", "Physics"],
    };
    expect(backgroundDigest(changed)).not.toBe(backgroundDigest(brief()));
    expect(comparisonIsStale(built, changed)).toBe(true);
  });

  it("is stale when the comparison pipeline itself changed", () => {
    const built = comparison([]);
    expect(
      comparisonIsStale({ ...built, providerVersion: `${COMPARISON_PROVIDER_VERSION}-old` }, brief())
    ).toBe(true);
  });

  it("reuses only an applicable result, and never an unavailable one", () => {
    const built = comparison([
      {
        unitRef: "t1",
        overlap: "LIKELY_COVERED_BY_CURRICULUM",
        confidence: "HIGH",
        sourceIds: [OFFICIAL_ID],
        explanationCode: "BACKGROUND_TOPIC_MATCH",
      },
    ]);
    const stored = brief({ comparison: built });
    expect(reusableComparison(stored)).not.toBeNull();
    expect(reusableComparison(brief())).toBeNull();
    expect(reusableComparison(brief({ comparison: { ...built, status: "UNAVAILABLE" } }))).toBeNull();
  });

  it("does not let a stored result exceed its own bounds", () => {
    expect(COMPARISON_LIMITS.units).toBe(50);
    expect(COMPARISON_LIMITS.modelPasses).toBe(1);
    expect(COMPARISON_LIMITS.sourcesPerUnit).toBe(4);
  });
});

describe("comparison: the student's correction outranks it and is never rewritten", () => {
  const built = comparison([
    {
      unitRef: "t1",
      overlap: "LIKELY_COVERED_BY_CURRICULUM",
      confidence: "HIGH",
      sourceIds: [OFFICIAL_ID],
      explanationCode: "BACKGROUND_TOPIC_MATCH",
    },
  ]);

  const correction = (overlap: OverlapCorrection["overlap"]): OverlapCorrection => ({
    unitRef: "t1",
    overlap,
    targetScopeDigest: built.targetScopeDigest,
    correctedAt: "2030-01-04T00:00:00.000Z",
  });

  it("applies the student's answer, keeping what Sylf said", () => {
    const corrected = applyOverlapCorrections(built, [correction("LIKELY_NEW_TO_CURRICULUM")]);
    const matrices = corrected.units.find((unit) => unit.unitRef === "t1")!;
    expect(matrices.overlap).toBe("LIKELY_NEW_TO_CURRICULUM");
    expect(matrices.corrected).toBe(true);
    expect(matrices.originalOverlap).toBe("LIKELY_COVERED_BY_CURRICULUM");
    // A person's answer cites nothing and carries no research confidence.
    expect(matrices.sourceIds).toEqual([]);
    expect(matrices.explanationCode).toBe("STUDENT_CORRECTION");
    // The stored comparison is untouched: the correction is layered on read.
    expect(built.units.find((unit) => unit.unitRef === "t1")!.overlap).toBe(
      "LIKELY_COVERED_BY_CURRICULUM"
    );
  });

  it("ignores a correction made against a different scope", () => {
    const retired = { ...correction("LIKELY_NEW_TO_CURRICULUM"), targetScopeDigest: "0".repeat(32) };
    const applied = applyOverlapCorrections(built, [retired]);
    expect(applied.units.find((unit) => unit.unitRef === "t1")!.overlap).toBe(
      "LIKELY_COVERED_BY_CURRICULUM"
    );
  });

  it("offers the coverage suggestion only for units the comparison covered", () => {
    expect(coverageSuggestionRefs(built)).toEqual(["t1"]);
    expect(coverageSuggestionRefs(null)).toEqual([]);
    const corrected = applyOverlapCorrections(built, [correction("LIKELY_NEW_TO_CURRICULUM")]);
    // The student said it is new, so it is no longer offered as "studied".
    expect(coverageSuggestionRefs(corrected)).toEqual([]);
  });
});

describe("comparison: the summary counts rows, and never a person", () => {
  it("counts four states and names the background", () => {
    const counts = overlapCounts(comparison([
      { unitRef: "t1", overlap: "LIKELY_COVERED_BY_CURRICULUM", confidence: "HIGH", sourceIds: [OFFICIAL_ID], explanationCode: "BACKGROUND_TOPIC_MATCH" },
      { unitRef: "t2", overlap: "PARTIAL_OVERLAP", confidence: "MEDIUM", sourceIds: [OFFICIAL_ID], explanationCode: "BACKGROUND_PARTIAL_MATCH" },
      { unitRef: "t3", overlap: "LIKELY_NEW_TO_CURRICULUM", confidence: "MEDIUM", sourceIds: [OFFICIAL_ID], explanationCode: "NOT_IN_BACKGROUND_CURRICULUM" },
    ]).units);
    // The scope flattens to three units (t1, t2, t3): a selected container with a
    // selected topic under it is represented by its topics, not by itself.
    expect(counts).toEqual({ covered: 1, partial: 1, isNew: 1, unclear: 0, total: 3 });
    const sentence = comparisonSummarySentence(counts, "CAIE A-Level");
    expect(sentence).toContain("1 likely familiar");
    expect(sentence).toContain("your CAIE A-Level background");
    expect(sentence).not.toMatch(/known|master|confiden/i);
  });
});

describe("comparison: the research extraction schema is unchanged by Phase 3", () => {
  it("still rejects a scope extraction that carries a URL", () => {
    expect(
      ResearchExtractionSchema.safeParse({
        targetIdentity: { name: "x", institution: null, board: null, level: null },
        scope: [{ label: "x", kind: "TOPIC", parentIndex: null, url: "https://x.example" }],
        sourceMappings: [],
        unresolved: [],
        extractionConfidence: "HIGH",
        conflicts: [],
      }).success
    ).toBe(false);
  });
});

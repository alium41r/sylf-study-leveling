// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  deriveCoverageState,
  followUpTargets,
  summariseCoverage,
} from "@/lib/planner/research/coverage";
import { emptyLedger, type VerifiedEvidenceClaim } from "@/lib/planner/research/evidence";
import type { ResearchObjective } from "@/lib/planner/research/search/contracts";
import type { ResearchSource } from "@/lib/planner/research/contracts";

/**
 * Objective coverage, and the two rules that make it worth reading.
 *
 * The first is that coverage is computed from verified evidence and from nothing else. The
 * extraction contract has no coverage field at all, so a model cannot say a question is answered;
 * the strongest thing it can do is supply a quotation the server finds on a page it fetched.
 *
 * The second is that disagreement is not automatically fatal. An old secondary guide contradicting
 * the current official specification should not blank out an answer the authority has settled —
 * and two comparable authorities disagreeing should not be quietly resolved in favour of whichever
 * page happened to be read first.
 */

const source = (sourceId: string, sourceType: ResearchSource["sourceType"]): ResearchSource => ({
  sourceId,
  url: `https://${sourceId}.example/spec`,
  title: "Specification",
  publisherOrDomain: `${sourceId}.example`,
  sourceType,
  retrievedAt: "2030-01-01T00:00:00.000Z",
  documentDate: null,
  nodeIds: [],
  mappingConfidence: "MEDIUM",
});

const SOURCES: ResearchSource[] = [
  source("official-pdf", "OFFICIAL_PDF"),
  source("official-site", "OFFICIAL"),
  source("institution", "INSTITUTIONAL"),
  source("blog", "SECONDARY"),
  source("other-official", "OFFICIAL_PDF"),
];

const sourceMap = new Map(SOURCES.map((entry) => [entry.sourceId, entry]));

const claim = (over: Partial<VerifiedEvidenceClaim> = {}): VerifiedEvidenceClaim => ({
  claimId: `ev-${Math.random().toString(16).slice(2)}`,
  objectiveId: "o1",
  sourceId: "official-pdf",
  statement: "Paper 1 is 75 marks.",
  excerpt: "Paper 1 is worth 75 marks in total.",
  evidenceKind: "DIRECT",
  support: "SUPPORTS",
  documentDate: null,
  ...over,
});

const objectives: ResearchObjective[] = [
  { id: "o1", question: "What subjects are tested?", priority: "PRIMARY" },
  { id: "o2", question: "What are the entry requirements?", priority: "SUPPORTING" },
];

const derived = (claims: VerifiedEvidenceClaim[]) =>
  deriveCoverageState({ claims, sources: sourceMap });

describe("no verified evidence is no answer", () => {
  it("is UNANSWERED when there are no claims", () => {
    expect(derived([]).state).toBe("UNANSWERED");
  });

  it("cannot be talked into COVERED, because there is no field to say it in", () => {
    // The model's opinion has nowhere to land: coverage is derived, so a hierarchy full of
    // confident prose with no verified quotation produces UNANSWERED regardless.
    const coverage = computeCoverage({ objectives, ledger: emptyLedger(), sources: SOURCES });
    expect(coverage.map((entry) => entry.state)).toEqual(["UNANSWERED", "UNANSWERED"]);
    expect(coverage[0].claimCount).toBe(0);
  });

  it("is PARTIAL for indirect evidence from a single secondary source", () => {
    const state = derived([claim({ sourceId: "blog", evidenceKind: "INDIRECT", support: "PARTIAL" })]);
    expect(state.state).toBe("PARTIAL");
    expect(state.corroboratingSources).toBe(1);
  });

  it("is PARTIAL for direct evidence from one secondary source, because one blog settles nothing", () => {
    expect(derived([claim({ sourceId: "blog" })]).state).toBe("PARTIAL");
  });

  it("is COVERED for direct evidence from the target's own authority", () => {
    expect(derived([claim({ sourceId: "official-pdf" })]).state).toBe("COVERED");
  });

  it("is COVERED for direct evidence from two independent secondary sources", () => {
    // Corroboration is the other route to an answer, and it must be real corroboration: two
    // *different* documents, which is what the count below checks.
    const state = derived([
      claim({ sourceId: "blog", claimId: "ev-1" }),
      claim({ sourceId: "institution", claimId: "ev-2" }),
    ]);
    expect(state.state).toBe("COVERED");
    expect(state.corroboratingSources).toBe(2);
  });
});

describe("repeated discovery of one page is not corroboration", () => {
  it("counts one source once however many times it was found", () => {
    /**
     * The Phase 1 pool records that a URL was returned by seven queries. That means the page is
     * easy to find. It does not mean seven documents agree, and coverage counts *sources*, so a
     * page discovered seven times contributes exactly one.
     */
    const many = Array.from({ length: 7 }, (_, index) => claim({ claimId: `ev-${index}` }));
    const state = derived(many);
    expect(state.corroboratingSources).toBe(1);
    expect(derived(many).state).toBe("COVERED");
  });

  it("counts two genuinely distinct official documents as two", () => {
    const state = derived([
      claim({ sourceId: "official-pdf", claimId: "ev-1" }),
      claim({ sourceId: "other-official", claimId: "ev-2" }),
    ]);
    expect(state.corroboratingSources).toBe(2);
    expect(state.state).toBe("COVERED");
  });
});

describe("disagreement is recorded, and only sometimes fatal", () => {
  it("lets the current official document outweigh an old secondary guide", () => {
    // §34 of the phase specification: the student gets a settled answer, and the disagreement —
    // "an old guide says something different" — is still visible in the evidence.
    const state = derived([
      claim({ sourceId: "official-pdf", claimId: "ev-new", statement: "Paper 1 is 75 marks." }),
      claim({
        sourceId: "blog",
        claimId: "ev-old",
        support: "CONTRADICTS",
        statement: "Paper 1 is 60 marks.",
        excerpt: "Paper 1 carries 60 marks.",
      }),
    ]);
    expect(state.state).toBe("COVERED");
    expect(state.conflict).toBe("OUTWEIGHED");
  });

  it("refuses to choose when two comparable authorities disagree", () => {
    const state = derived([
      claim({ sourceId: "official-pdf", claimId: "ev-a" }),
      claim({
        sourceId: "other-official",
        claimId: "ev-b",
        support: "CONTRADICTS",
        statement: "Paper 1 is 60 marks.",
        excerpt: "Paper 1 carries 60 marks.",
      }),
    ]);
    expect(state.state).toBe("CONFLICTED");
    expect(state.conflict).toBe("UNRESOLVED");
    // Both records survive; the state says the question is open rather than picking a side.
    expect(state.corroboratingSources).toBe(1);
  });

  it("ignores a page disagreeing with itself", () => {
    // Two claims from one source cannot constitute a controversy about that source.
    const state = derived([
      claim({ sourceId: "official-pdf", claimId: "ev-a" }),
      claim({ sourceId: "official-pdf", claimId: "ev-b", support: "CONTRADICTS" }),
    ]);
    expect(state.conflict).toBe("NONE");
    expect(state.state).toBe("COVERED");
  });

  it("does not treat a contradiction with nothing supporting it as a conflict", () => {
    const state = derived([claim({ sourceId: "blog", support: "CONTRADICTS" })]);
    expect(state.conflict).toBe("NONE");
    // No supporting evidence at all, so the question is not answered — it is barely addressed.
    expect(state.state).toBe("PARTIAL");
  });
});

describe("coverage follows the plan's objectives, in plan order", () => {
  it("reports every objective the plan stated", () => {
    const coverage = computeCoverage({
      objectives,
      ledger: { ...emptyLedger(), claims: [claim({ objectiveId: "o1" })], accepted: 1 },
      sources: SOURCES,
    });
    expect(coverage.map((entry) => entry.objectiveId)).toEqual(["o1", "o2"]);
    expect(coverage.map((entry) => entry.state)).toEqual(["COVERED", "UNANSWERED"]);
    expect(coverage[0].question).toBe("What subjects are tested?");
  });

  it("summarises what was answered and what is still open", () => {
    const coverage = computeCoverage({
      objectives: [
        ...objectives,
        { id: "o3", question: "What is the exam structure?", priority: "PRIMARY" },
      ],
      ledger: { ...emptyLedger(), claims: [claim({ objectiveId: "o1" })], accepted: 1 },
      sources: SOURCES,
    });
    expect(summariseCoverage(coverage)).toEqual({
      totalObjectives: 3,
      covered: 1,
      partial: 0,
      unanswered: 2,
      conflicted: 0,
      // Both o2 and o3 are unsettled; only o3 is primary, and that is the number that decides
      // whether the extra follow-up round is worth spending.
      highPriorityUnanswered: 1,
    });
  });
});

describe("the follow-up round chases what matters", () => {
  const coverageOf = (states: [string, string][]) =>
    states.map(([id, state]) => ({
      objectiveId: id,
      question: `Question ${id}`,
      priority: objectives.find((entry) => entry.id === id)?.priority ?? "PRIMARY",
      state: state as "COVERED" | "PARTIAL" | "UNANSWERED" | "CONFLICTED",
      claimCount: 0,
      corroboratingSources: 0,
      conflict: "NONE" as const,
    }));

  it("targets an unanswered primary objective first", () => {
    const targets = followUpTargets(coverageOf([["o1", "UNANSWERED"], ["o2", "PARTIAL"]]));
    expect(targets.map((entry) => entry.objectiveId)).toEqual(["o1"]);
  });

  it("does not spend the round on a supporting detail while a primary question is open", () => {
    const targets = followUpTargets(coverageOf([["o1", "PARTIAL"], ["o2", "UNANSWERED"]]));
    // o2 is supporting and o1 is primary: priority decides, not which is emptier.
    expect(targets.map((entry) => entry.objectiveId)).toEqual(["o1"]);
  });

  it("falls back to supporting objectives when every primary one is answered", () => {
    const targets = followUpTargets(coverageOf([["o1", "COVERED"], ["o2", "UNANSWERED"]]));
    expect(targets.map((entry) => entry.objectiveId)).toEqual(["o2"]);
  });

  it("targets nothing when every objective is covered, so the follow-up does not run", () => {
    expect(followUpTargets(coverageOf([["o1", "COVERED"], ["o2", "COVERED"]]))).toEqual([]);
  });

  it("counts a conflicted objective as unfinished", () => {
    expect(followUpTargets(coverageOf([["o1", "CONFLICTED"]])).map((entry) => entry.objectiveId)).toEqual(["o1"]);
  });
});

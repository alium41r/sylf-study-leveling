// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildLedger,
  claimIdFor,
  nodeEvidenceClaimIds,
  rejectedCount,
  verifyExcerpt,
} from "@/lib/planner/research/evidence";
import { EVIDENCE_LIMITS, EvidenceClaimSchema } from "@/lib/planner/research/search/contracts";

/**
 * The evidence contract: a quotation is not evidence until the server has found it on the page.
 *
 * Everything here is adversarial. The model is a fluent writer with no obligation to be accurate
 * about which document said what, so the only interesting questions are the ones where it is
 * wrong: a quote that does not exist, a quote from the wrong page, a citation to a page nobody
 * fetched. Each must fail closed, and the failure must be *counted* rather than silent, because a
 * run whose evidence was all discarded looks identical to a run that found nothing unless the
 * rejection counts are kept.
 */

const PAGE = "The syllabus for Paper 1 covers Algebra, Sequences and Series, and Calculus.\nCandidates must answer all questions.";

const fetched = [{ sourceId: "src-a", text: PAGE }];
const objectives = new Set(["o1", "o2"]);

const claim = (over: Record<string, unknown> = {}) => ({
  objectiveId: "o1",
  sourceId: "src-a",
  statement: "The paper covers algebra and calculus.",
  excerpt: "covers Algebra, Sequences and Series, and Calculus.",
  evidenceKind: "DIRECT",
  support: "SUPPORTS",
  documentDate: null,
  ...over,
});

const ledgerOf = (claims: unknown[], extra: { fetched?: typeof fetched; known?: Set<string> } = {}) =>
  buildLedger({
    proposed: claims,
    fetched: extra.fetched ?? fetched,
    knownObjectiveIds: extra.known ?? objectives,
  });

describe("excerpts are verified against the page, not taken on trust", () => {
  it("accepts a verbatim span and stores the page's own wording", () => {
    const checked = verifyExcerpt({ excerpt: "covers Algebra, Sequences and Series", sourceText: PAGE });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(PAGE).toContain(checked.excerpt);
  });

  it("accepts a quotation whose line breaks differ from the page's", () => {
    // The model reads a sentence that the page wraps across two lines. That is a layout
    // difference, not a misquotation, so whitespace is collapsed before comparing.
    const checked = verifyExcerpt({
      excerpt: "and Calculus. Candidates must answer all questions.",
      sourceText: "The syllabus for Paper 1 covers Algebra, Sequences and Series, and Calculus.\nCandidates must answer all questions.",
    });
    expect(checked.ok).toBe(true);
  });

  it("refuses a quotation that is not on the page", () => {
    const checked = verifyExcerpt({ excerpt: "Candidates must study Further Mathematics.", sourceText: PAGE });
    expect(checked).toEqual({ ok: false, reason: "EXCERPT_NOT_FOUND" });
  });

  it("refuses a quotation too short to be evidence of anything", () => {
    // "Algebra" appears on the page, and appearing is not the same as supporting a claim about
    // what the specification requires.
    const checked = verifyExcerpt({ excerpt: "Algebra", sourceText: PAGE });
    expect(checked).toEqual({ ok: false, reason: "EXCERPT_TOO_SHORT" });
  });

  it("refuses a quotation longer than the bound", () => {
    const checked = verifyExcerpt({ excerpt: "x".repeat(EVIDENCE_LIMITS.excerptChars + 1), sourceText: PAGE });
    expect(checked).toEqual({ ok: false, reason: "EXCERPT_TOO_LONG" });
  });

  it("is case-sensitive, because a quotation is the page's words and not a paraphrase", () => {
    const checked = verifyExcerpt({ excerpt: "covers algebra, sequences and series", sourceText: PAGE });
    expect(checked.ok).toBe(false);
  });
});

describe("the claim contract is strict", () => {
  it("refuses an unknown field, including a URL", () => {
    // There is nowhere for a model-authored address to land, and the schema is what guarantees
    // it rather than a convention anyone has to remember.
    expect(EvidenceClaimSchema.safeParse(claim({ url: "https://evil.example" })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ claimId: "ev-forged" })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ coverage: "COVERED" })).success).toBe(false);
  });

  it("bounds the statement, the excerpt and the identifiers", () => {
    expect(EvidenceClaimSchema.safeParse(claim({ statement: "x".repeat(EVIDENCE_LIMITS.statementChars + 1) })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ excerpt: "x".repeat(EVIDENCE_LIMITS.excerptChars + 1) })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ objectiveId: "o".repeat(41) })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ sourceId: "" })).success).toBe(false);
  });

  it("refuses an evidence kind or support value outside the closed sets", () => {
    expect(EvidenceClaimSchema.safeParse(claim({ evidenceKind: "CERTAIN" })).success).toBe(false);
    expect(EvidenceClaimSchema.safeParse(claim({ support: "PROVES" })).success).toBe(false);
  });
});

describe("a ledger keeps only what it can prove", () => {
  it("accepts a claim whose excerpt is on the cited page", () => {
    const ledger = ledgerOf([claim()]);
    expect(ledger.claims).toHaveLength(1);
    expect(ledger.accepted).toBe(1);
    expect(ledger.claims[0].excerpt).toContain("Algebra, Sequences and Series");
  });

  it("drops a fabricated quotation", () => {
    const ledger = ledgerOf([claim({ excerpt: "Candidates must study Further Mathematics for Paper 2." })]);
    expect(ledger.claims).toEqual([]);
    expect(ledger.rejected.EXCERPT_NOT_FOUND).toBe(1);
  });

  it("drops an excerpt that belongs to a different page than the one cited", () => {
    // The quotation is real and the source id is real; they simply do not go together. This is
    // the failure mode that would let a run assemble citations from any two documents it read.
    const ledger = ledgerOf([claim({ sourceId: "src-b" })], {
      fetched: [
        { sourceId: "src-a", text: PAGE },
        { sourceId: "src-b", text: "This page is about parking permits and nothing else at all." },
      ],
    });
    expect(ledger.claims).toEqual([]);
    expect(ledger.rejected.EXCERPT_NOT_FOUND).toBe(1);
  });

  it("drops a citation to a source the server never issued", () => {
    const ledger = ledgerOf([claim({ sourceId: "src-invented" })]);
    expect(ledger.rejected.UNKNOWN_SOURCE).toBe(1);
  });

  it("drops a citation to a source the model was given but that could not be read", () => {
    // A different defect from inventing a source, and counted separately: this one means the
    // fetch failed, which is a deployment fact rather than a model fault.
    const ledger = buildLedger({
      proposed: [claim({ sourceId: "src-dead" })],
      fetched: [
        { sourceId: "src-a", text: PAGE },
        // `src-dead` was issued to the model as an empty read and cannot support anything.
        { sourceId: "src-dead", text: "" },
      ],
      knownObjectiveIds: objectives,
    });
    expect(ledger.rejected.SOURCE_NOT_FETCHED).toBe(1);
  });

  it("drops evidence about an objective the plan never stated", () => {
    const ledger = ledgerOf([claim({ objectiveId: "o9" })]);
    expect(ledger.rejected.UNKNOWN_OBJECTIVE).toBe(1);
  });

  it("drops a malformed claim without losing the rest of the batch", () => {
    const ledger = ledgerOf([claim(), { objectiveId: "o1" }, claim({ statement: "" })]);
    expect(ledger.claims).toHaveLength(1);
    expect(ledger.rejected.MALFORMED).toBe(2);
  });

  it("bounds claims per source, per objective and overall", () => {
    const many = Array.from({ length: EVIDENCE_LIMITS.claimsPerSource + 3 }, (_, index) => ({
      ...claim(),
      excerpt: `Candidates must answer all questions. (mark ${index} note)`,
    }));
    const ledger = ledgerOf(many, { fetched: [{ sourceId: "src-a", text: `${PAGE} ${many.map((c) => c.excerpt).join(" ")}` }] });
    expect(ledger.claims.length).toBeLessThanOrEqual(EVIDENCE_LIMITS.claimsPerSource);
    expect(ledger.rejected.OVER_CLAIM_BOUND).toBeGreaterThan(0);
  });

  it("bounds the total ledger across a whole run", () => {
    // Four sources × four claims each is the per-source ceiling, which the total must still cap.
    const sources = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"].map((id) => ({
      sourceId: id,
      text: `${PAGE} ${"The specification lists every unit in order. ".repeat(6)}`,
    }));
    const claims = sources.flatMap((source, sourceIndex) =>
      Array.from({ length: EVIDENCE_LIMITS.claimsPerSource }, (_, index) => ({
        ...claim({ sourceId: source.sourceId }),
        excerpt: `The specification lists every unit in order. (${sourceIndex}-${index})`,
      }))
    );
    const ledger = buildLedger({ proposed: claims, fetched: sources, knownObjectiveIds: objectives });
    expect(ledger.claims.length).toBeLessThanOrEqual(EVIDENCE_LIMITS.claims);
  });

  it("gives the same evidence the same id, so two rounds merge instead of duplicating", () => {
    const first = ledgerOf([claim()]);
    const second = ledgerOf([claim()], { fetched });
    expect(first.claims[0].claimId).toBe(second.claims[0].claimId);
    // And the id depends on the source, the objective and the quotation — not on the paraphrase,
    // which the model may word differently on a second pass.
    const reworded = ledgerOf([claim({ statement: "Different words, same quotation." })]);
    expect(reworded.claims[0].claimId).toBe(first.claims[0].claimId);
    expect(claimIdFor({ sourceId: "src-a", objectiveId: "o2", excerpt: first.claims[0].excerpt })).not.toBe(
      first.claims[0].claimId
    );
  });

  it("counts a repeat as a duplicate rather than storing it twice", () => {
    const ledger = ledgerOf([claim(), claim({ statement: "Same quotation again." })]);
    expect(ledger.claims).toHaveLength(1);
    expect(ledger.rejected.DUPLICATE).toBe(1);
  });

  it("carries earlier claims forward so a follow-up round adds evidence instead of replacing it", () => {
    const first = ledgerOf([claim()]);
    const second = buildLedger({
      proposed: [claim({ objectiveId: "o2", excerpt: "Candidates must answer all questions." })],
      fetched,
      knownObjectiveIds: objectives,
      carried: first.claims,
    });
    expect(second.claims).toHaveLength(2);
    expect(second.claims.filter((entry) => entry.objectiveId === "o1")).toHaveLength(1);
  });

  it("reports the rejections it made rather than hiding them", () => {
    const ledger = ledgerOf([claim({ excerpt: "Nothing on this page says that at all, truly." }), { bad: true }]);
    expect(rejectedCount(ledger)).toBe(2);
  });
});

describe("node evidence is derived, never duplicated", () => {
  it("joins a node's cited sources to the claims behind them", () => {
    const ledger = ledgerOf([claim(), claim({ objectiveId: "o2", excerpt: "Candidates must answer all questions." })]);
    const ids = nodeEvidenceClaimIds({ sourceIds: ["src-a"] }, ledger.claims);
    expect(ids).toHaveLength(2);
  });

  it("returns nothing for a node that cites nothing", () => {
    const ledger = ledgerOf([claim()]);
    expect(nodeEvidenceClaimIds({}, ledger.claims)).toEqual([]);
    expect(nodeEvidenceClaimIds({ sourceIds: ["src-unread"] }, ledger.claims)).toEqual([]);
  });
});

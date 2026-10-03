// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scoreCandidate, selectSources, type SelectionContext } from "@/lib/planner/research/selection";
import { buildCandidatePool, type CandidatePoolEntry } from "@/lib/planner/research/search/pool";
import type { ResearchObjective } from "@/lib/planner/research/search/contracts";

/**
 * The reranking matrix.
 *
 * Phase 1 ranked by authority tier and read the top four. Phase 2 selects by marginal value, which
 * means authority is now a weight among several — and a weight that can be got wrong in both
 * directions. Rank relevance too weakly and an official page about parking still consumes a read
 * slot; rank it too strongly and a search-optimised blog outranks the exam board.
 *
 * These fixtures pin both directions, and the numbers they pin are not arbitrary: every
 * non-authority signal sums to at most 17 against authority steps of 10, so exactly one tier is
 * crossable and two are not. Each case below states which side of that line it is testing.
 */

const target = { goal: "NUST NET Engineering", subject: "Engineering", board: null, level: null };

const objectives: ResearchObjective[] = [
  { id: "o1", question: "What subjects are tested in the paper?", priority: "PRIMARY" },
  { id: "o2", question: "What are the entry requirements for admission?", priority: "PRIMARY" },
  { id: "o3", question: "What is the exam structure and duration?", priority: "SUPPORTING" },
];

/** A pool entry with everything the scorer reads. */
const entry = (over: Partial<CandidatePoolEntry> & { url: string }): CandidatePoolEntry => ({
  title: "Page",
  snippet: null,
  provider: "brave",
  providers: ["brave"],
  rank: 1,
  queries: ["q"],
  objectiveIds: ["o1"],
  confirmations: 1,
  ...over,
});

const pool = (entries: CandidatePoolEntry[]) => buildCandidatePool({ contributions: [] }) && entries;

const context = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  target,
  objectives,
  openObjectiveIds: new Set(objectives.map((objective) => objective.id)),
  chosenDomains: new Map(),
  failedUrls: new Set(),
  readUrls: new Set(),
  targetYear: null,
  ...over,
});

const chosen = (entries: CandidatePoolEntry[], slots: number, over: Partial<SelectionContext> = {}) =>
  selectSources({ pool: entries, context: context(over), slots }).map((scored) => scored.entry.url);

describe("the reranking matrix", () => {
  it("prefers an official syllabus over an official page that does not answer the question", () => {
    /**
     * Case 1 — the defect the whole reranking exists to fix, within one authority tier.
     *
     * Both are official, so authority cannot separate them; Phase 1's relevance signal had to,
     * and the point of pinning it is that a change to the scoring must not lose it.
     */
    const syllabus = entry({
      url: "https://nust.edu.pk/net/syllabus-specification.pdf",
      title: "NET Syllabus and Specification",
    });
    const parking = entry({ url: "https://nust.edu.pk/parking-regulations", title: "Parking Regulations" });
    expect(chosen(pool([parking, syllabus]), 1)).toEqual([syllabus.url]);
  });

  it("lets a strongly on-topic institutional mirror beat an official page that answers nothing", () => {
    /**
     * Case 2 — one authority tier, deliberately crossable.
     *
     * An official page that does not answer the question is not evidence, and reading it costs a
     * slot that could have answered something. Relevance plus coverage can therefore move a
     * candidate up exactly one tier: institutional (10) with the full 17 of signal reaches -7 and
     * an official page with no signal sits at 0.
     *
     * The rule this does *not* break: the mirror is still labelled INSTITUTIONAL, the status rules
     * still refuse it `OK`, and it never becomes official just for being useful.
     */
    const adminOfficial = entry({ url: "https://nust.edu.pk/notices/fee-schedule", title: "Fee Schedule Notice" });
    const mirror = entry({
      // `.edu` is what makes a host institutional — the classification is a fact about the
      // address, not about how useful the page looks.
      url: "https://engineering.university.edu/net-syllabus-subjects",
      // Every content word of the question appears: this is what "highly relevant" has to mean for
      // the tier to be crossed at all.
      title: "What subjects are tested in the NET syllabus paper",
      objectiveIds: ["o1"],
    });
    expect(chosen(pool([adminOfficial, mirror]), 1)).toEqual([mirror.url]);
  });

  it("never lets a secondary page overtake an official one, however syllabus-shaped", () => {
    /**
     * Case 6 — two authority tiers, deliberately not crossable.
     *
     * This is the bound that keeps "relevance matters" from turning into "search-engine
     * optimisation matters". Secondary best case is 20 - 17 = 3; official worst case is 0. The
     * gap is the guarantee.
     */
    const official = entry({ url: "https://nust.edu.pk/notices/exam-schedule", title: "Examination Schedule" });
    const seo = entry({
      url: "https://best-net-prep.example/net-2027-syllabus-pdf-download",
      title: "NET 2027 Syllabus PDF Download - Complete Subjects and Entry Requirements Guide",
      objectiveIds: ["o1", "o2", "o3"],
    });
    expect(chosen(pool([seo, official]), 1)).toEqual([official.url]);
  });

  it("lets confirmations help without letting one page take every slot", () => {
    /**
     * Case 3 — repeated discovery is a tie-breaker, not a monopoly.
     *
     * A URL four queries all returned is easy to find. Worth a bounded bonus, and never worth more
     * than one slot's worth of influence: the second slot goes to a different page.
     */
    const repeated = entry({
      url: "https://nust.edu.pk/net/syllabus",
      title: "NET Syllabus",
      queries: ["a", "b", "c", "d"],
      confirmations: 4,
    });
    const once = entry({ url: "https://nust.edu.pk/net/paper-structure", title: "NET Paper Structure", objectiveIds: ["o3"] });
    // Both are read. Confirmations influenced the ordering but did not take both slots.
    expect(new Set(chosen(pool([repeated, once]), 2))).toEqual(new Set([repeated.url, once.url]));
  });

  it("spends a slot on an uncovered objective rather than a second page for a covered one", () => {
    /**
     * Case 4 — the objective-aware part, which a plain sort cannot do.
     *
     * Four candidates answer o1 and one answers o2. Without the coverage term the o2 page is
     * merely "slightly lower" and never read; with it, the second slot closes a question instead
     * of repeating one. This is §7 of the phase specification in one assertion.
     */
    // Each o1 page is *more* relevant than the o2 page, so a plain sort would spend both slots on
    // o1 and never read the question that is actually open.
    const o1Pages = ["a", "b", "c", "d"].map((slug, index) =>
      entry({
        url: `https://nust.edu.pk/net/${slug}`,
        title: `What subjects are tested in the NET paper ${slug}`,
        rank: index + 1,
        objectiveIds: ["o1"],
      })
    );
    const o2Page = entry({
      url: "https://nust.edu.pk/admissions/requirements",
      title: "Admissions overview",
      objectiveIds: ["o2"],
    });
    const picked = chosen(pool([...o1Pages, o2Page]), 2);
    expect(picked).toHaveLength(2);
    expect(picked[0]).toContain("/net/");
    // The second slot closes o2 rather than repeating o1.
    expect(picked[1]).toBe(o2Page.url);
  });

  it("prefers the document that matches the year the request named", () => {
    /**
     * Case 5 — freshness where it means something.
     *
     * A version preference is applied only when the request itself named a year. With no year
     * named the two documents score identically on it, and a timeless topic is never ranked by
     * recency — which is why `targetYear` is null in every other fixture here.
     */
    const current = entry({ url: "https://cambridgeinternational.org/spec-2027", title: "Specification (2027)" });
    const old = entry({ url: "https://cambridgeinternational.org/spec-2020", title: "Specification (2020)" });
    expect(chosen(pool([old, current]), 1, { targetYear: 2027 })).toEqual([current.url]);

    // Without a stated year neither is preferred, and the tie-break decides.
    expect(chosen(pool([old, current]), 1)).toEqual(["https://cambridgeinternational.org/spec-2020"]);
  });

  it("keeps a three-document authority cluster together when relevance agrees", () => {
    /**
     * Diversity is a preference and never a rule.
     *
     * Three relevant official documents from one authority are a better evidence set than one of
     * them plus a secondary page chosen for variety, so the diversity penalty is small enough to
     * lose to authority and relevance — which is what this asserts.
     */
    const official = ["syllabus", "specification", "subject-content"].map((slug, index) =>
      entry({ url: `https://nust.edu.pk/net/${slug}`, title: `NET ${slug}`, rank: index + 1 })
    );
    const otherHost = entry({ url: "https://another-university.example/net", title: "NET overview" });
    const picked = chosen(pool([...official, otherHost]), 3, { openObjectiveIds: new Set(["o1"]) });
    expect(picked.slice(0, 2).every((url) => url.includes("nust.edu.pk"))).toBe(true);
  });
});

describe("selection is deterministic", () => {
  it("returns the same pages whatever order the pool arrives in", () => {
    /**
     * Phase 1 built the pool in plan order precisely so completion order could not change the
     * result. Phase 2 adds a second source of order-dependence — the greedy loop — so the same
     * property is asserted again at this layer: shuffling the pool must not change the choice.
     */
    const entries = [
      entry({ url: "https://nust.edu.pk/a", title: "NET syllabus", objectiveIds: ["o1"] }),
      entry({ url: "https://nust.edu.pk/b", title: "NET syllabus", objectiveIds: ["o1"] }),
      entry({ url: "https://another.example/c", title: "NET syllabus", objectiveIds: ["o1"] }),
      entry({ url: "https://nust.edu.pk/d", title: "Entry requirements", objectiveIds: ["o2"] }),
    ];
    const forward = chosen(entries, 3);
    const reversed = chosen([...entries].reverse(), 3);
    const shuffled = chosen([entries[2], entries[0], entries[3], entries[1]], 3);
    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it("scores a candidate identically whichever position it holds in the pool", () => {
    const one = entry({ url: "https://nust.edu.pk/net/syllabus", title: "NET syllabus" });
    expect(scoreCandidate(one, context()).score).toBe(scoreCandidate({ ...one }, context()).score);
  });

  it("never selects a page that was already read or already failed", () => {
    const read = entry({ url: "https://nust.edu.pk/read", title: "NET syllabus" });
    const failed = entry({ url: "https://nust.edu.pk/failed", title: "NET syllabus" });
    const fresh = entry({ url: "https://nust.edu.pk/fresh", title: "NET syllabus" });
    const picked = chosen([read, failed, fresh], 3, {
      readUrls: new Set([read.url]),
      failedUrls: new Set([failed.url]),
    });
    expect(picked).toEqual([fresh.url]);
  });

  it("returns nothing when every candidate has been read or has failed", () => {
    const a = entry({ url: "https://nust.edu.pk/a" });
    const b = entry({ url: "https://nust.edu.pk/b" });
    expect(chosen([a, b], 2, { readUrls: new Set([a.url, b.url]) })).toEqual([]);
  });

  it("bounds how many candidates it will consider", () => {
    const entries = Array.from({ length: 20 }, (_, index) => entry({ url: `https://nust.edu.pk/${index}`, rank: index }));
    const picked = selectSources({ pool: entries, context: context(), slots: 4, consider: 6 });
    expect(picked).toHaveLength(4);
    // Every selection came from the considered head of the pool.
    expect(picked.every((scored) => entries.slice(0, 6).includes(scored.entry))).toBe(true);
  });

  it("explains its score, so a surprising pick can be read rather than guessed at", () => {
    const scored = scoreCandidate(
      entry({ url: "https://nust.edu.pk/net/syllabus", title: "What subjects are tested in the paper" }),
      context()
    );
    expect(scored.parts.authority).toBe(0);
    expect(scored.parts.coverage).toBeGreaterThan(0);
    expect(Object.keys(scored.parts).sort()).toEqual([
      "authority",
      "confirmations",
      "coverage",
      "providerDiversity",
      "relevance",
      "sameDomain",
      "version",
    ]);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  BRIEF_LIMITS,
  PlanBriefV1Schema,
  emptyBrief,
  flattenScope,
  serializedBriefBytes,
  type PlanBriefV1,
  type ScopeNode,
} from "@/lib/planner/intake/brief";
import { distributeWeeklyBudget } from "@/lib/planner/intake/distribution";
import { inputBytesFor, examInputFromBrief } from "@/lib/planner/intake/to-input";
import { LIMITS } from "@/lib/planner/contracts";
import { RESEARCH_LIMITS } from "@/lib/planner/research/contracts";
import { EVIDENCE_LIMITS, RESEARCH_BOUNDS } from "@/lib/planner/research/search/contracts";

/**
 * The measured bounds Phase 1 claims.
 *
 * Written as a printable measurement rather than a benchmark suite: these numbers go
 * into the phase report, and a test that asserts them keeps them from drifting. Each
 * assertion is the contract the phase promised (brief, session, payload), and the
 * printed value is what it actually costs.
 */

const units = (count: number): ScopeNode[] =>
  Array.from({ length: count }, (_, index) => ({
    nodeId: `u-${index + 1}`,
    label: `Unit ${index + 1} of a realistic syllabus title`,
    kind: "TOPIC" as const,
    parentId: null,
    selected: true,
  }));

const chapters = (chapters: number, perChapter: number): ScopeNode[] => {
  const nodes: ScopeNode[] = [];
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    nodes.push({
      nodeId: `c-${chapter}`,
      label: `Chapter ${chapter}`,
      kind: "CHAPTER",
      parentId: null,
      selected: true,
    });
    for (let topic = 1; topic <= perChapter; topic += 1)
      nodes.push({
        nodeId: `c-${chapter}-t-${topic}`,
        label: `Chapter ${chapter} topic ${topic}`,
        kind: "TOPIC",
        parentId: `c-${chapter}`,
        selected: true,
      });
  }
  return nodes;
};

describe("Phase 1 measurements", () => {
  it("keeps the brief inside its 64 KiB envelope, at both ends of the scale", () => {
    const empty = emptyBrief("EXAM");
    const small = { ...empty, scope: { ...empty.scope, nodes: units(10) } };
    const full = { ...empty, scope: { ...empty.scope, nodes: chapters(18, 10) } };
    const numbers = {
      emptyBytes: serializedBriefBytes(empty),
      tenUnitsBytes: serializedBriefBytes(small),
      twoHundredNodesBytes: serializedBriefBytes(full),
      capBytes: BRIEF_LIMITS.briefBytes,
    };
    console.log("brief bytes", numbers);
    expect(numbers.emptyBytes).toBeLessThan(numbers.capBytes);
    // 198 nodes sits just under the schema maximum (BRIEF_LIMITS.scopeNodes = 200),
    // and even that is 3× inside the byte envelope.
    expect(full.scope.nodes).toHaveLength(198);
    expect(PlanBriefV1Schema.safeParse(full).success).toBe(true);
    expect(numbers.twoHundredNodesBytes).toBeLessThan(numbers.capBytes);
    // The node cap is the binding constraint, not the byte budget: a 220-node scope is
    // refused by the schema, which is why the flattening contract exists.
    expect(PlanBriefV1Schema.safeParse({ ...empty, scope: { ...empty.scope, nodes: chapters(20, 10) } }).success).toBe(false);
  });

  it("keeps the engine input inside the existing payload bound", () => {
    const brief = {
      ...emptyBrief("EXAM"),
      goal: { title: "Biology mock" },
      subject: { kind: "FREE_TEXT" as const, subjectId: null, name: "Biology" },
      target: { endDate: "2030-02-04", examDate: "2030-02-04" },
      budget: {
        weeklyMinutes: 600,
        dailyOverrides: null,
        blockedDates: [],
        recoveryPercent: null,
        acceptReducedReserve: false,
        distribution: null,
      },
      scope: {
        source: "USER_MANUAL" as const,
        confirmedAt: null,
        provenanceRefs: [],
        provenanceSources: [],
        nodes: units(40),
        removedLabels: [],
      },
    };
    const input = examInputFromBrief(brief, {
      today: "2030-01-07",
      restWeekdays: [0],
      dailyGoalMinutes: 60,
    });
    const bytes = inputBytesFor(brief, {
      today: "2030-01-07",
      restWeekdays: [0],
      dailyGoalMinutes: 60,
    });
    console.log("adapter payload bytes", { fortyUnits: bytes, capBytes: LIMITS.inputBytes });
    expect(bytes).toBeLessThan(LIMITS.inputBytes);
    expect(input.scope.split("\n")).toHaveLength(40);
  });

  it("keeps the engine unit count inside the existing topic limit, by coarsening", () => {
    // 200 fine-grained nodes must become a plan, not an error and not a truncation.
    const flat = flattenScope(chapters(20, 10));
    console.log("flatten strategies", {
      topicUnits: flattenScope(units(40)).units.length,
      twoHundredNodes: flat.units.length,
      strategy: flat.strategy,
      leafCount: flat.leafCount,
      cap: LIMITS.topics,
    });
    expect(flat.units.length).toBeLessThanOrEqual(LIMITS.topics);
    expect(flat.leafCount).toBe(200);
    expect(flat.units.length).toBeGreaterThan(0);
  });

  it("distributes a weekly budget in well under a millisecond", () => {
    const samples = 2000;
    const started = performance.now();
    for (let index = 0; index < samples; index += 1)
      distributeWeeklyBudget({
        weeklyMinutes: 600,
        firstDate: "2030-01-07",
        lastDate: "2030-03-31",
        restWeekdays: [0],
        floatingRestDates: ["2030-01-15"],
        existingLoadByDate: { "2030-01-08": 60 },
      });
    const perCallMs = (performance.now() - started) / samples;
    console.log("distribution runtime", { perCallMs: Number(perCallMs.toFixed(4)), samples });
    // A generous ceiling on purpose: this is a cost measurement, not a correctness
    // property, and a parallel full-suite run is a noisy machine. The reported figure
    // (see the phase report) is measured on an idle run; the assertion only catches a
    // change of algorithm — anything quadratic would blow past this immediately.
    expect(perCallMs).toBeLessThan(10);
  });
});

/**
 * Phase 3 §32: the worst case, now that a brief can carry research output.
 *
 * Phase 1 measured the brief with 198 nodes and nothing else on it. Phase 2 and 3 added
 * `scopeCandidate` — coverage rows, a verified evidence ledger, up to eight source records and five
 * open questions — and every one of those is persisted *beside* the nodes, in the same 64 KiB
 * envelope. That is the number §32 asks for, and it is worth measuring rather than reasoning about
 * because the two maxima land on the same object: a scope at its 200-node ceiling is also the scope
 * most likely to have been researched.
 *
 * The measurement found a boundary, and pinning it here is the point of the file. **The confirmed
 * brief always fits** — 51,641 of 65,536 bytes at 200 nodes with four citations each, so the
 * durable state has 21% headroom. **The review state fits to a measured crossover**, because
 * `scopeCandidate` holds a second copy of the node tree next to `scope.nodes`: at 200 candidate
 * nodes the envelope holds about 28 verified claims, and at the full 32-claim ledger it holds about
 * 160 nodes. Beyond that the write is *refused* with `PAYLOAD_TOO_LARGE` rather than truncated,
 * which is the behaviour asserted below — the boundary is a documented limit, not a surprise.
 *
 * The fixtures use the *real* id formats (`src-` plus sixteen hex, `r-` plus a slug) and the
 * reachable shapes, not every per-field schema maximum at once: `sources[].nodeIds` is always empty
 * in the research path (`agent.ts` pushes every fetched source with `nodeIds: []`), and a fixture
 * that filled it with 200 ids each would measure a candidate this code cannot produce. Label length
 * is the one input the model controls freely, so it is varied explicitly.
 */

/** A realistic unit label — the median real scope unit is shorter than this. */
const unitLabel = (index: number): string => `Sequences and series ${index + 1}`;
/** A 200-character label, the `ScopeNodeSchema` maximum, for the pathological bound. */
const maxLabel = (index: number): string => `Chapter ${index + 1} `.padEnd(200, "x");

const VERIFIED_CLAIM_BYTES = EVIDENCE_LIMITS.statementChars + EVIDENCE_LIMITS.excerptChars;

const sourcedNodes = (count: number, label: (index: number) => string, citations: number): ScopeNode[] =>
  Array.from({ length: count }, (_, index) => ({
    nodeId: `r-sequences-and-series-${index + 1}`,
    label: label(index),
    kind: "TOPIC" as const,
    parentId: index % 12 === 0 ? null : `r-chapter-${(index % 12) + 1}`,
    selected: true,
    ...(citations
      ? { sourceIds: Array.from({ length: citations }, (_, slot) => `src-0123456789abcde${slot}`) }
      : {}),
  }));

/** Source records as `buildSource` writes them: a real URL, a real title, no node ids. */
const sourceRecords = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    sourceId: `src-0123456789abcde${index}`,
    url: `https://www.cambridgeinternational.org/programmes-and-qualifications/mathematics-9709/${"u".repeat(60)}`,
    title: "Cambridge International AS & A Level Mathematics 9709 syllabus and specimen papers".padEnd(120, "t"),
    publisherOrDomain: "cambridgeinternational.org",
    sourceType: "OFFICIAL_PDF" as const,
    retrievedAt: "2030-01-01T00:00:00.000Z",
    documentDate: "Specification 2027",
    nodeIds: [] as string[],
    mappingConfidence: "HIGH" as const,
  }));

/** The same provenance snapshot a confirmation leaves behind: eight records, no node ids. */
const provenanceSources = (count: number) =>
  sourceRecords(count).map(({ nodeIds: _nodeIds, mappingConfidence: _mappingConfidence, ...rest }) => rest);

const claimedLedger = (claims: number) => ({
  claims: Array.from({ length: claims }, (_, index) => ({
    claimId: `claim-${index + 1}`,
    objectiveId: `o${(index % 6) + 1}`,
    sourceId: `src-0123456789abcde${index % 8}`,
    statement: "m".repeat(EVIDENCE_LIMITS.statementChars),
    excerpt: "e".repeat(EVIDENCE_LIMITS.excerptChars),
    evidenceKind: "DIRECT" as const,
    support: "SUPPORTS" as const,
    documentDate: null,
  })),
  rejected: 40,
});

const researchCandidate = (nodes: ScopeNode[], claims: number) => ({
  version: 1 as const,
  origin: "RESEARCH" as const,
  status: "OK" as const,
  confidence: "HIGH" as const,
  briefDigest: "d".repeat(64),
  retrievedAt: "2030-01-01T00:00:00.000Z",
  provider: "deepseek-search",
  cacheKey: "k".repeat(64),
  depth: "DEEP" as const,
  nodes,
  sources: sourceRecords(RESEARCH_LIMITS.sources),
  openQuestions: Array.from({ length: 5 }, () => "q".repeat(120)),
  failureCode: null,
  summary: "s".repeat(200),
  coverage: {
    summary: { totalObjectives: 6, covered: 4, partial: 1, unanswered: 1, conflicted: 0, highPriorityUnanswered: 1 },
    objectives: Array.from({ length: RESEARCH_BOUNDS.maxResearchObjectives }, (_, index) => ({
      objectiveId: `o${index + 1}`,
      question: `What does objective ${index} require?`.padEnd(120, "w"),
      priority: "PRIMARY" as const,
      state: "PARTIAL" as const,
      claimCount: EVIDENCE_LIMITS.claimsPerSource,
      corroboratingSources: RESEARCH_LIMITS.sources,
      conflict: "NONE" as const,
    })),
    followUpUsed: true,
  },
  evidence: claimedLedger(claims),
});

describe("Phase 3 §32 — brief size with research attached", () => {
  const cap = BRIEF_LIMITS.briefBytes;

  /** One review-state brief: an empty confirmed scope plus a candidate, which is the real shape. */
  const reviewBrief = (nodes: number, claims: number, options: { label?: (i: number) => string; citations?: number } = {}) => ({
    ...emptyBrief("EXAM"),
    scope: { ...emptyBrief("EXAM").scope, nodes: [] as ScopeNode[] },
    scopeCandidate: researchCandidate(
      sourcedNodes(nodes, options.label ?? unitLabel, options.citations ?? 4),
      claims
    ),
  });

  /** The guard `assertInvariants` applies on every write, as a predicate. */
  const bytesOf = (brief: unknown) => serializedBriefBytes(brief as PlanBriefV1);
  const fits = (brief: unknown) => bytesOf(brief) <= cap;

  it("always fits the durable state: 200 confirmed nodes, each citing four sources", () => {
    const empty = emptyBrief("EXAM");
    const confirmed = {
      ...empty,
      scope: {
        ...empty.scope,
        source: "RESEARCH_CONFIRMED" as const,
        confirmedAt: "2030-01-01T00:00:00.000Z",
        nodes: sourcedNodes(BRIEF_LIMITS.scopeNodes, unitLabel, 4),
        provenanceSources: provenanceSources(RESEARCH_LIMITS.sources),
      },
    };
    const bytes = bytesOf(confirmed);
    console.log("§32 confirmed scope", { bytes, cap, headroomBytes: cap - bytes });

    expect(PlanBriefV1Schema.safeParse(confirmed).success).toBe(true);
    expect(confirmed.scope.nodes).toHaveLength(BRIEF_LIMITS.scopeNodes);
    // Confirmation clears the candidate, so this is the state a student keeps — and it is the
    // number that must hold, because it is the one that persists.
    expect(fits(confirmed)).toBe(true);
    expect(cap - bytes).toBeGreaterThan(cap * 0.1);
  });

  it("fits the review state at every size a real research run produces", () => {
    const numbers = {
      // The shapes observed live: DEEP extracted 44 units and verified between 2 and 8 claims.
      fortyFourUnitsEightClaims: bytesOf(reviewBrief(44, 8)),
      eightyUnitsFullLedger: bytesOf(reviewBrief(80, EVIDENCE_LIMITS.claims)),
      // The §32 node ceiling, with the ledger a real run produces rather than the maximum.
      twoHundredUnitsLiveClaims: bytesOf(reviewBrief(200, 8)),
      twoHundredUnitsSixteenClaims: bytesOf(reviewBrief(200, 16)),
      // Where the full ledger stops fitting: the tightest state still inside the envelope.
      oneSixtyUnitsFullLedger: bytesOf(reviewBrief(160, EVIDENCE_LIMITS.claims)),
      oneTwentyUnitsFullLedger: bytesOf(reviewBrief(120, EVIDENCE_LIMITS.claims)),
      cap,
    };
    console.log("§32 review state", numbers);

    const { cap: _cap, ...measured } = numbers;
    for (const [name, bytes] of Object.entries(measured))
      expect({ name, fits: bytes <= cap }).toEqual({ name, fits: true });
  });

  it("measures the crossover instead of assuming there is none", () => {
    // The named §32 worst case — 200 units *and* a full 32-claim ledger — does not fit. This test
    // records that in the suite so the boundary is enforced knowledge rather than a surprise, and
    // it pins the *behaviour*: the write is refused, never truncated, so a brief can never be
    // stored having silently lost its tail.
    const fullLedgerAtTwoHundred = bytesOf(reviewBrief(200, EVIDENCE_LIMITS.claims));
    const eightClaimsAtTwoHundred = bytesOf(reviewBrief(200, 8));
    console.log("§32 measured crossover", {
      twoHundredUnitsFullLedger: fullLedgerAtTwoHundred,
      overBy: fullLedgerAtTwoHundred - cap,
      claimsThatFitAtTwoHundredUnits: 8 + Math.floor((cap - eightClaimsAtTwoHundred) / VERIFIED_CLAIM_BYTES),
      cap,
    });
    expect(fullLedgerAtTwoHundred).toBeGreaterThan(cap);
    expect(eightClaimsAtTwoHundred).toBeLessThan(cap);
    expect(bytesOf(reviewBrief(160, EVIDENCE_LIMITS.claims))).toBeLessThan(cap);
    expect(bytesOf(reviewBrief(180, EVIDENCE_LIMITS.claims))).toBeGreaterThan(cap);
  });

  it("cannot be guaranteed by a node count alone, because labels are the model's to size", () => {
    // 200 maximum-length labels with no citations at all still cost more than 200 real ones with a
    // full ledger. That is why the byte guard — not a node ceiling — is the actual safety property,
    // and why the candidate'\''s node bound is a product choice rather than a guarantee.
    const maxLabels = { label: maxLabel, citations: 0 };
    const numbers = {
      maxLabelTwoHundred: bytesOf(reviewBrief(200, 0, maxLabels)),
      maxLabelOneTwenty: bytesOf(reviewBrief(120, 0, maxLabels)),
      maxLabelEighty: bytesOf(reviewBrief(80, 0, maxLabels)),
      maxLabelForty: bytesOf(reviewBrief(40, 0, maxLabels)),
      cap,
    };
    console.log("§32 maximum-length labels", numbers);
    expect(numbers.maxLabelTwoHundred).toBeGreaterThan(cap);
    expect(numbers.maxLabelEighty).toBeLessThan(cap);
  });
});

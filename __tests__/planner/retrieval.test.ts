// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  RETRIEVAL_LIMITS,
  RETRIEVAL_PURPOSES,
  RetrievalStampSchema,
  assertRetrievalInvariants,
  isSecureScopeTopic,
  learningDatesOf,
  minimumRetrievalGapDays,
  normalizeRetrievalStamps,
  planRetrievalTouches,
  requiresLaterRetrieval,
  retrievalViolations,
  stampProposalRetrieval,
  type RetrievalPurpose,
} from "@/lib/planner/retrieval";
import { PlannerValidationError } from "@/lib/planner/errors";
import { datesBetween } from "@/lib/planner/dates";
import { normalizeProposal } from "@/lib/planner/server/core";
import { validateMasteryProposal } from "@/lib/planner/mastery-policy";
import { validateRoadmapProposal } from "@/lib/planner/roadmap-policy";
import { validateExpansionItems, expansionScope } from "@/lib/planner/expansion-policy";
import {
  masteryAvailability,
  masteryFixture,
  masteryProposal,
  shortMasteryFixture,
} from "./mastery-fixtures";
import { roadmapAvailability, roadmapFixture, roadmapProposal } from "./roadmap-fixtures";
import type { FrozenItemView } from "@/lib/planner/rebalance-policy";

/** A schedule of fully-open days with a fixed remaining budget. */
function openSchedule(start: string, end: string, remainingMinutes = 120) {
  return {
    startDate: start,
    endDate: end,
    days: datesBetween(start, end).map((date) => ({ date, remainingMinutes })),
    touchMinutes: 20,
    sessionCapMinutes: null,
  };
}

const codeOf = (action: () => unknown): string | null => {
  try {
    action();
    return null;
  } catch (error) {
    if (error instanceof PlannerValidationError) return error.message;
    throw error;
  }
};

describe("Retrieval representation and boundedness", () => {
  it("keeps a closed purpose vocabulary aligned with the existing intents", () => {
    expect(RETRIEVAL_PURPOSES).toEqual([
      "RECALL",
      "REINFORCEMENT",
      "PRACTICE",
      "MISTAKE_REVIEW",
    ]);
    expect(RETRIEVAL_LIMITS.maxMinimumGapDays).toBe(90);
    expect(RETRIEVAL_LIMITS.maxIndex).toBe(60);
  });

  it("accepts a versioned stamp and refuses out-of-bound or off-vocabulary values", () => {
    expect(
      RetrievalStampSchema.safeParse({
        retrievalGroupRef: "rg1",
        retrievalPurpose: "RECALL",
        retrievalIndex: 1,
        minimumGapDays: 3,
      }).success
    ).toBe(true);
    expect(RetrievalStampSchema.safeParse({ minimumGapDays: 91 }).success).toBe(false);
    expect(RetrievalStampSchema.safeParse({ retrievalPurpose: "DRILL" }).success).toBe(false);
    // The model token is plan-local `rgN`, never an item ref or a durable id.
    expect(RetrievalStampSchema.safeParse({ retrievalGroupRef: "i1" }).success).toBe(false);
  });

  it("reuses the existing covered+confidence signal for security", () => {
    expect(isSecureScopeTopic({ covered: true, confidence: 4 })).toBe(true);
    expect(isSecureScopeTopic({ covered: true, confidence: 3 })).toBe(false);
    expect(isSecureScopeTopic({ covered: false, confidence: 5 })).toBe(false);
  });

  it("stamps a proposal touch and normalizes shared refs to one durable id", () => {
    const stamp = stampProposalRetrieval("RECALL", "rg1", 1, 3);
    expect(stamp.retrievalGroupRef).toBe("rg1");
    expect(stamp.retrievalPurpose).toBe("RECALL");

    const minted: string[] = [];
    const items: {
      retrievalGroupRef?: string;
      retrievalGroupId?: string | null;
      retrievalIndex?: number;
    }[] = [
      { retrievalGroupRef: "rg1", retrievalIndex: 1 },
      { retrievalGroupRef: "rg1", retrievalIndex: 2 },
      { retrievalGroupRef: "rg2", retrievalIndex: 1 },
      {},
    ];
    const normalized = normalizeRetrievalStamps(items, (ref) => {
      const id = `id:${ref}`;
      minted.push(id);
      return id;
    });
    expect(normalized[0].retrievalGroupId).toBe("id:rg1");
    expect(normalized[1].retrievalGroupId).toBe("id:rg1");
    expect(normalized[2].retrievalGroupId).toBe("id:rg2");
    expect(normalized[3]).toEqual({});
    expect(minted).toEqual(["id:rg1", "id:rg2"]);
    expect(normalized.every((item) => !("retrievalGroupRef" in item))).toBe(true);
  });
});

describe("Deterministic spacing ladder", () => {
  it("compresses a short horizon but never below one day", () => {
    expect(minimumRetrievalGapDays(3, "RECALL")).toBe(1);
    expect(minimumRetrievalGapDays(7, "RECALL")).toBe(2);
    expect(minimumRetrievalGapDays(14, "RECALL")).toBe(3);
    expect(minimumRetrievalGapDays(27, "RECALL")).toBe(3);
    expect(minimumRetrievalGapDays(28, "RECALL")).toBe(5);
    expect(minimumRetrievalGapDays(60, "RECALL")).toBe(7);
  });

  it("scales spacing with the remaining horizon", () => {
    // A 7-day plan and a 60-day plan must not share the same spacing policy.
    expect(minimumRetrievalGapDays(7, "RECALL")).toBeLessThan(
      minimumRetrievalGapDays(60, "RECALL")
    );
  });

  it("gives secure material shorter reinforcement", () => {
    expect(minimumRetrievalGapDays(30, "REINFORCEMENT", { secure: true })).toBeLessThan(
      minimumRetrievalGapDays(30, "REINFORCEMENT", { secure: false })
    );
  });

  it("gates later retrieval identically to Mastery's fixed floor", () => {
    expect(requiresLaterRetrieval(13, "RECALL")).toBe(false);
    expect(requiresLaterRetrieval(14, "RECALL")).toBe(true);
  });
});

describe("Retrieval scheduling policy", () => {
  it("decides required recall on a long horizon and places it after learning", () => {
    const touches = planRetrievalTouches(openSchedule("2030-01-07", "2030-01-27"), [
      { ref: "t1", secure: false, learnedOn: "2030-01-07" },
    ]);
    const recall = touches.find((touch) => touch.purpose === "RECALL")!;
    expect(recall.requirement).toBe("REQUIRED");
    expect(recall.minimumGapDays).toBe(3);
    expect(recall.placeOn).not.toBeNull();
    expect(datesBetween("2030-01-07", recall.placeOn!).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("never places retrieval outside the horizon", () => {
    const touches = planRetrievalTouches(openSchedule("2030-01-07", "2030-01-14"), [
      { ref: "t1", secure: false, learnedOn: "2030-01-14" },
    ]);
    for (const touch of touches) expect(touch.placeOn).toBeNull();
  });

  it("never places retrieval on the same day as learning", () => {
    const touches = planRetrievalTouches(openSchedule("2030-01-07", "2030-01-14"), [
      { ref: "t1", secure: false, learnedOn: "2030-01-07" },
    ]);
    for (const touch of touches)
      if (touch.placeOn !== null) expect(touch.placeOn).not.toBe("2030-01-07");
  });
});

describe("Retrieval invariant validation", () => {
  const horizon = { startDate: "2030-01-07", endDate: "2030-01-28" };
  const learning = new Map([["t1", "2030-01-08"]]);

  it("rejects retrieval before (or on the same day as) its learning", () => {
    const before = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [{ ref: "r1", topicRef: "t1", date: "2030-01-07", purpose: "RECALL" }],
    });
    expect(before).toContain("RETRIEVAL_BEFORE_LEARNING");
    const sameDay = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [{ ref: "r1", topicRef: "t1", date: "2030-01-08", purpose: "RECALL" }],
    });
    expect(sameDay).toContain("RETRIEVAL_BEFORE_LEARNING");
  });

  it("rejects a gap below the recorded minimum", () => {
    const codes = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [
        { ref: "r1", topicRef: "t1", date: "2030-01-10", purpose: "RECALL", minimumGapDays: 5 },
      ],
    });
    expect(codes).toContain("RETRIEVAL_GAP_TOO_SHORT");
  });

  it("rejects retrieval outside the horizon", () => {
    const codes = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [{ ref: "r1", topicRef: "t1", date: "2030-02-03", purpose: "RECALL" }],
    });
    expect(codes).toContain("RETRIEVAL_OUTSIDE_HORIZON");
  });

  it("rejects accidental duplicate retrieval work", () => {
    const codes = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [
        { ref: "r1", topicRef: "t1", date: "2030-01-10", purpose: "RECALL" },
        { ref: "r2", topicRef: "t1", date: "2030-01-10", purpose: "RECALL" },
      ],
    });
    expect(codes).toContain("RETRIEVAL_DUPLICATE");
  });

  it("rejects two different purposes clustered on one day", () => {
    const codes = retrievalViolations({
      ...horizon,
      learningDateOf: (ref) => learning.get(ref) ?? null,
      retrievals: [
        { ref: "r1", topicRef: "t1", date: "2030-01-10", purpose: "RECALL" },
        { ref: "r2", topicRef: "t1", date: "2030-01-10", purpose: "PRACTICE" },
      ],
    });
    expect(codes).toContain("RETRIEVAL_CLUSTERED");
  });

  it("throws the first violation through the shared validation error", () => {
    expect(() =>
      assertRetrievalInvariants({
        ...horizon,
        learningDateOf: (ref) => learning.get(ref) ?? null,
        retrievals: [
          { ref: "r1", topicRef: "t1", date: "2030-01-07", purpose: "RECALL" },
        ],
      })
    ).toThrow("RETRIEVAL_BEFORE_LEARNING");
  });

  it("derives learning dates from the items a touch revisits", () => {
    const dates = learningDatesOf(
      [
        { topicRef: "t1", type: "LEARN", date: "2030-01-08" },
        { topicRef: "t1", type: "RECALL", date: "2030-01-10" },
        { topicRef: "t2", type: "PRACTICE", date: "2030-01-12" },
      ],
      ["LEARN", "PRACTICE"]
    );
    expect(dates.get("t1")).toBe("2030-01-08");
    expect(dates.get("t2")).toBe("2030-01-12");
  });
});

describe("Integration: normalization and the mode floors", () => {
  it("normalizes a proposal's model refs into durable retrieval ids", () => {
    const input = masteryFixture();
    const proposal = JSON.parse(JSON.stringify(masteryProposal(input)));
    for (const [index, item] of proposal.items.entries()) {
      if (item.masteryStage !== "ACTIVE_RECALL") continue;
      item.retrievalGroupRef = "rg1";
      item.retrievalPurpose = "RECALL";
      item.retrievalIndex = index;
      item.minimumGapDays = 3;
    }
    const draft = normalizeProposal(input, proposal);
    expect(draft.mode).toBe("MASTERY");
    const stamped = draft.items.filter((item) => item.retrievalGroupId);
    expect(stamped.length).toBeGreaterThan(0);
    // One shared model token becomes one shared durable id, and the token is dropped.
    expect(new Set(stamped.map((item) => item.retrievalGroupId)).size).toBe(1);
    expect(stamped.every((item) => !("retrievalGroupRef" in item))).toBe(true);
  });

  it("routes Mastery's later-retrieval gate through the shared policy unchanged", () => {
    // The gate is `requiresLaterRetrieval(horizonDays, "RECALL")` — identical to the
    // fixed `>= 14` this mode always used, so a valid fixture still passes and a
    // short-horizon plan still skips the rule.
    expect(() =>
      validateMasteryProposal(masteryFixture(), masteryProposal(), masteryAvailability())
    ).not.toThrow();
    const short = shortMasteryFixture();
    expect(
      codeOf(() =>
        validateMasteryProposal(short, masteryProposal(short), masteryAvailability())
      )
    ).toBeNull();
  });
});

describe("Integration: replan history and the strategic layer", () => {
  it("lets frozen completed retrieval satisfy the progression without regeneration", () => {
    const input = masteryFixture();
    const proposal = masteryProposal(input);
    const recall = proposal.items.filter(
      (item) => item.masteryStage === "ACTIVE_RECALL"
    );
    const withoutRecall = { ...proposal, items: proposal.items.filter((item) => item.masteryStage !== "ACTIVE_RECALL") };
    // Without history, dropping recall is not a mastery plan.
    expect(
      codeOf(() => validateMasteryProposal(input, withoutRecall, masteryAvailability()))
    ).toBe("MISSING_ACTIVE_RECALL");
    // With the completed recall as frozen history, the remaining work still holds.
    const frozen: FrozenItemView[] = recall.map((item, index) => ({
      key: `recall-${index}`,
      topicRef: item.topicRef,
      relatedTopicRefs: item.relatedTopicRefs ?? [],
      type: item.type,
      masteryStage: item.masteryStage,
      title: item.title,
      description: item.description,
      date: item.date,
      minutes: item.minutes,
    }));
    expect(() =>
      validateMasteryProposal(input, withoutRecall, masteryAvailability(), frozen)
    ).not.toThrow();
  });

  it("keeps the strategic roadmap item-free even with shared retrieval available", () => {
    const input = roadmapFixture();
    const draft = normalizeProposal(input, roadmapProposal(input));
    if (draft.mode !== "ROADMAP") throw new Error("roadmap draft expected");
    expect(draft.items).toHaveLength(0);
    expect(draft.expansion).toBeUndefined();
    // A strategic proposal that carries a retrieval item is refused, never scheduled.
    const polluted = roadmapProposal(input);
    polluted.items = [
      {
        ref: "i1",
        topicRef: "t1",
        relatedTopicRefs: [],
        milestoneRef: "m1",
        dependsOn: [],
        type: "RECALL",
        title: "Recall the unit",
        description: "Recall from memory, then check the gaps.",
        date: "2030-01-10",
        minutes: 15,
        retrievalPurpose: "RECALL",
        retrievalGroupRef: "rg1",
        retrievalIndex: 1,
        minimumGapDays: 2,
      },
    ];
    expect(() =>
      validateRoadmapProposal(input, polluted, roadmapAvailability())
    ).toThrow("ROADMAP_ITEMS_NOT_ALLOWED");
  });
});

describe("Integration: a period expansion can schedule retrieval", () => {
  function prepared(): ReturnType<typeof expansionScope> & { input: ReturnType<typeof roadmapFixture> } {
    const input = roadmapFixture();
    const draft = normalizeProposal(input, roadmapProposal(input));
    if (draft.mode !== "ROADMAP") throw new Error("roadmap draft expected");
    const scope = expansionScope(draft, draft.milestones[0].key, input);
    return { ...scope, input };
  }

  it("accepts a stamped recall after learning inside the period, and enforces the gap", () => {
    const { input, ...scope } = prepared();
    const topic = scope.topics[0].ref;
    const base = {
      ref: "i1",
      topicRef: topic,
      relatedTopicRefs: [] as string[],
      title: "Learn the unit",
      description: "Work through the material.",
      rationale: "First pass.",
      completionCriteria: "Complete the reading and note open questions.",
      minutes: 30,
      dependsOn: [] as string[],
    };
    const learn = { ...base, type: "LEARN" as const, date: "2030-01-08" };
    const recall = {
      ...base,
      ref: "i2",
      type: "RECALL" as const,
      title: "Recall the unit",
      date: "2030-01-10",
      minutes: 20,
      dependsOn: ["i1"],
      retrievalPurpose: "RECALL" as const,
      retrievalIndex: 1,
      minimumGapDays: 2,
      retrievalGroupRef: "rg1",
    };
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [learn, recall])
    ).not.toThrow();
    // Same-day retrieval is refused through the shared invariant.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [
        learn,
        { ...recall, date: "2030-01-08" },
      ])
    ).toThrow("RETRIEVAL_BEFORE_LEARNING");
    // A gap below the recorded minimum is refused.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [
        learn,
        { ...recall, date: "2030-01-09" },
      ])
    ).toThrow("RETRIEVAL_GAP_TOO_SHORT");
  });

  it("does not demand regenerating retrieval already present as frozen history", () => {
    const { input, ...scope } = prepared();
    const topic = scope.topics[0].ref;
    const frozen: FrozenItemView[] = [
      {
        key: "frozen-recall",
        topicRef: topic,
        relatedTopicRefs: [],
        type: "RECALL",
        title: "Recall the unit",
        description: "Recall from memory.",
        date: "2030-01-10",
        minutes: 20,
      },
    ];
    const learn = {
      ref: "i1",
      topicRef: topic,
      relatedTopicRefs: [] as string[],
      type: "LEARN" as const,
      title: "Learn the unit",
      description: "Work through the material.",
      rationale: "First pass.",
      completionCriteria: "Complete the reading and note open questions.",
      date: "2030-01-08",
      minutes: 30,
      dependsOn: [] as string[],
    };
    // No proposed retrieval touch, but the completed recall is history: still valid.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [learn], frozen)
    ).not.toThrow();
  });
});

describe("Type-level guard: purposes stay closed", () => {
  it("exposes every purpose through the enum only", () => {
    const purposes: RetrievalPurpose[] = [...RETRIEVAL_PURPOSES];
    expect(purposes).toHaveLength(4);
    expect(new Set(purposes).size).toBe(4);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ScopeTopicSchema } from "@/lib/planner/scope-topic";
import { scopeTopicMinutes, scopeTopicPracticeFloor } from "@/lib/planner/scope-topic";
import {
  isSecure,
  isStatedCovered,
  isStatedNotCovered,
  isWeak,
  needsLearning,
  needsMistakeReview,
  preparednessForModel,
  preparednessState,
  provisionWeight,
} from "@/lib/planner/preparedness";
import { isHighPriorityWeak, priorityLevel } from "@/lib/planner/priority";
import { priorityTradeoffNotes, validateExamProposal } from "@/lib/planner/exam-policy";
import { examAvailability, examFixture, examProposal } from "./exam-fixtures";

/**
 * The preparedness policy, and the proof that the refactor changed nothing for a
 * student who *did* answer.
 *
 * Two properties are under test, and they pull in opposite directions:
 *
 * 1. **Unstated is not weak.** Every rule that used to read a bare `confidence`
 *    must now treat silence as silence — no priority escalation, no forced
 *    mistake-review work, no inflated weight — while still planning the learning a
 *    unit of unknown status may need.
 * 2. **Stated values behave exactly as before.** The same plan, with the same
 *    numbers, must validate and price identically, so no existing sealed snapshot
 *    or confirmed plan changes meaning.
 */
const topic = (over: Partial<{
  covered: boolean | null;
  confidence: number | null;
  difficult: boolean | null;
  priority: "NEUTRAL" | "LOW" | "HIGH";
}>) => ({
  label: "Cells",
  covered: true,
  confidence: 3,
  difficult: false,
  ...over,
});

/** THE case the review was about: a high-priority unit nobody rated. */
const highPriorityUnstated = {
  label: "Cells",
  covered: null,
  confidence: null,
  difficult: null,
  priority: "HIGH" as const,
};

describe("preparedness policy: unstated is not weak", () => {
  it("keeps every weak/secure classification false when nothing was stated", () => {
    const unstated = topic({ covered: null, confidence: null, difficult: null });
    expect(isWeak(unstated)).toBe(false);
    expect(isSecure(unstated)).toBe(false);
    expect(isStatedCovered(unstated)).toBe(false);
    expect(isStatedNotCovered(unstated)).toBe(false);
    expect(provisionWeight(unstated)).toBe(2);
    expect(needsMistakeReview(unstated)).toBe(false);
    // …while the plan still owes the unit its learning step.
    expect(needsLearning(unstated)).toBe(true);
  });

  it("never escalates a high-priority unanswered unit as weak", () => {
    expect(isHighPriorityWeak(highPriorityUnstated)).toBe(false);
    // The same unit, once the student says it is a struggle, escalates as before.
    expect(isHighPriorityWeak({ ...highPriorityUnstated, confidence: 2 })).toBe(true);
    expect(priorityLevel(highPriorityUnstated)).toBe("HIGH");
  });

  it("does not add the low-priority catch-up note for an unanswered unit", () => {
    const input = examFixture();
    const base = { ...input.exam!.topics[0], priority: "LOW" as const };
    const weak = { ...base, confidence: 2 };
    const unstated = { ...base, confidence: null };
    const notesFor = (first: Omit<typeof base, "confidence"> & { confidence: number | null }) =>
      priorityTradeoffNotes({
        ...input,
        exam: { ...input.exam!, topics: [first, input.exam!.topics[1], input.exam!.topics[2]] },
        scope: [first.label, input.exam!.topics[1].label, input.exam!.topics[2].label].join("\n"),
      } as never);
    expect(notesFor(weak)).toHaveLength(1);
    expect(notesFor(unstated)).toHaveLength(0);
  });

  it("preserves partial answers: coverage stated, confidence not", () => {
    const partial = topic({ covered: true, confidence: null });
    expect(isStatedCovered(partial)).toBe(true);
    expect(isWeak(partial)).toBe(false);
    expect(isSecure(partial)).toBe(false);
    expect(needsLearning(partial)).toBe(false);
    expect(provisionWeight(partial)).toBe(2);
  });

  it("marks the model context UNKNOWN with real nulls, never a fabricated rating", () => {
    const unstated = preparednessForModel(topic({ covered: null, confidence: null, difficult: null }));
    expect(unstated).toEqual({
      covered: null,
      confidence: null,
      difficult: null,
      preparedness: "UNKNOWN",
    });
    expect(preparednessState(topic({}))).toBe("STATED");
    expect(preparednessForModel(topic({ covered: true, confidence: 5, difficult: true }))).toEqual({
      covered: true,
      confidence: 5,
      difficult: true,
      preparedness: "STATED",
    });
  });

  it("prices an unanswered unit at the learning-required floor, not the weak floor", () => {
    // Documentation of intent: unknown coverage takes the 105-minute provision
    // because the unit may be entirely new; it does NOT take the 75-minute
    // weak-scaling provision, and nothing else inflates it.
    const unstated = scopeTopicMinutes(topic({ covered: null, confidence: null }), false);
    const weak = scopeTopicMinutes(topic({ covered: true, confidence: 1 }), false);
    const standard = scopeTopicMinutes(topic({ covered: true, confidence: 3 }), false);
    expect(unstated).toBe(scopeTopicMinutes(topic({ covered: false, confidence: null }), false));
    expect(unstated).toBeGreaterThan(standard);
    expect(unstated).toBeGreaterThan(weak);
    expect(scopeTopicPracticeFloor(topic({ covered: null, confidence: null }), false)).toBe(
      scopeTopicPracticeFloor(topic({ covered: false, confidence: null }), false)
    );
  });

  it("keeps stated values priced exactly as before", () => {
    // These are the pre-refactor formulas, asserted so the refactor is provably
    // behaviour-preserving for anyone who answered.
    expect(scopeTopicMinutes(topic({ covered: true, confidence: 3, difficult: false }), false)).toBe(45);
    expect(scopeTopicMinutes(topic({ covered: true, confidence: 2, difficult: false }), false)).toBe(75);
    expect(scopeTopicMinutes(topic({ covered: false, confidence: 5, difficult: false }), false)).toBe(105);
    expect(scopeTopicMinutes(topic({ covered: true, confidence: 3, difficult: true }), false)).toBe(75);
    expect(scopeTopicPracticeFloor(topic({ covered: true, confidence: 3 }), false)).toBe(30);
    expect(scopeTopicPracticeFloor(topic({ covered: false, confidence: 3 }), false)).toBe(60);
    expect(scopeTopicPracticeFloor(topic({ covered: false, confidence: 3, difficult: true }), false)).toBe(75);
  });
});

describe("preparedness schema compatibility", () => {
  it("still accepts the boolean/number shape every sealed snapshot carries", () => {
    expect(ScopeTopicSchema.safeParse({ label: "Cells", covered: true, confidence: 4, difficult: false }).success).toBe(true);
    expect(ScopeTopicSchema.safeParse({ label: "Cells", covered: false, confidence: 1, difficult: true }).success).toBe(true);
  });

  it("accepts nulls, and rejects values outside the stated ranges", () => {
    expect(ScopeTopicSchema.safeParse({ label: "Cells", covered: null, confidence: null, difficult: null }).success).toBe(true);
    expect(ScopeTopicSchema.safeParse({ label: "Cells", covered: true, confidence: 0, difficult: false }).success).toBe(false);
    expect(ScopeTopicSchema.safeParse({ label: "Cells", covered: true, confidence: 6, difficult: false }).success).toBe(false);
  });
});

describe("exam rules: an unanswered unit is not a struggle", () => {
  /** The fixture plan, with t2 described by the caller. */
  const withTopic2 = (over: Record<string, unknown>) => {
    const base = examFixture();
    const topics = base.exam!.topics.map((entry, index) =>
      index === 1 ? { ...entry, ...over } : entry
    ) as typeof base.exam.topics;
    return { ...base, exam: { ...base.exam!, topics }, scope: topics.map((t) => t.label).join("\n") } as typeof base;
  };

  /** The fixture proposal, optionally without t2's mistake-review item. */
  const proposalWithoutTopic2MistakeReview = () => {
    const proposal = examProposal();
    return {
      ...proposal,
      items: proposal.items.filter(
        (item) => !(item.topicRef === "t2" && item.type === "MISTAKE_REVIEW")
      ),
    } as typeof proposal;
  };

  it("does not force mistake-review work merely because confidence was unstated", () => {
    const proposal = proposalWithoutTopic2MistakeReview();
    // Stated weak: the planner still demands the mistake review it always did.
    expect(() =>
      validateExamProposal(withTopic2({ covered: true, confidence: 2 }), proposal, examAvailability())
    ).toThrow("MISSING_MISTAKE_REVIEW");
    // Unanswered: no such demand is invented from silence.
    expect(() =>
      validateExamProposal(withTopic2({ covered: true, confidence: null }), proposal, examAvailability())
    ).not.toThrow();
  });

  it("still accepts the untouched fixture, so nothing regressed for stated plans", () => {
    expect(() =>
      validateExamProposal(examFixture(), examProposal(), examAvailability())
    ).not.toThrow();
  });

  it("treats an explicit 'not covered' as a real gap, exactly as before", () => {
    // A stated gap keeps every rule that a gap deserves.
    expect(needsLearning(topic({ covered: false, confidence: null }))).toBe(true);
    expect(provisionWeight(topic({ covered: false, confidence: null }))).toBe(4);
    expect(isStatedNotCovered(topic({ covered: false, confidence: null }))).toBe(true);
  });
});

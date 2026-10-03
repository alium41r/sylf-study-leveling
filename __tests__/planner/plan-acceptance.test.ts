// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeProposal } from "@/lib/planner/server/core";
import { validateDraft } from "@/lib/planner/contracts";
import { completionCriteriaIssue } from "@/lib/planner/done";
import { coverageMap } from "@/lib/planner/coverage";
import { intensityAdvisories } from "@/lib/planner/load";
import { isStretch, stretchItems } from "@/lib/planner/planner-role";
import { retrievalViolations } from "@/lib/planner/retrieval";
import { priorityLevel } from "@/lib/planner/priority";
import { examFixture, examProposal } from "./exam-fixtures";
import { masteryFixture, masteryProposal } from "./mastery-fixtures";
import { roadmapFixture, roadmapProposal } from "./roadmap-fixtures";

/**
 * §66 plan-quality acceptance, expressed as data rather than prose.
 *
 * The goal asks that a valid plan be able to answer nine questions. Eight of them are
 * answerable only if the plan actually carries the facts, so each one is asserted here
 * against real generated fixtures for every mode — the point being that the answer is
 * a property of the stored plan, not something the UI has to invent or the reader has
 * to infer. The ninth ("is the workload realistic?") is a judgement the quality layer
 * measures; here it is only checked for the signals it needs.
 */
const exam = () => {
  const input = examFixture();
  return { input, draft: normalizeProposal(input, examProposal()) };
};
const mastery = () => {
  const input = masteryFixture();
  return { input, draft: normalizeProposal(input, masteryProposal(input)) };
};
const roadmap = () => {
  const input = roadmapFixture();
  return { input, draft: normalizeProposal(input, roadmapProposal(input)) };
};

describe("plan-quality acceptance: what a generated plan must be able to answer", () => {
  it("1–3. what to do, why it is here, and when — for every item", () => {
    for (const { draft } of [exam(), mastery(), roadmap()]) {
      for (const item of draft.items) {
        // "What must I do?" — a title and a concrete description.
        expect(item.title.trim().length).toBeGreaterThan(0);
        expect(item.description.trim().length).toBeGreaterThan(0);
        // "Why is this here?" — every mode's validators require a rationale.
        if ("rationale" in item)
          expect(String(item.rationale ?? "").trim().length).toBeGreaterThan(0);
        // "When should I do it?" — a plan date.
        expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("4. what can be skipped — optional work is marked, and marked work is not required", () => {
    const { input, draft } = exam();
    // Optional work the student can skip without breaking the plan: the role is on the
    // item, and a draft with no Stretch work has nothing to skip, which is also valid.
    const stretch = stretchItems(draft.items);
    expect(stretch.every((item) => isStretch(item))).toBe(true);
    for (const item of stretch)
      expect(item.role).toBe("STRETCH");
    // The Core-only plan still validates, so "skip the Stretch" is a real answer.
    const coreOnly = { ...draft, items: draft.items.filter((item) => !isStretch(item)) };
    expect(() => validateDraft(input, coreOnly)).not.toThrow();
  });

  it("5. every supplied topic is accounted for, or visibly not", () => {
    const { input, draft } = exam();
    const units = draft.topics.map((topic) => ({ key: topic.key, title: topic.title }));
    const map = coverageMap({
      units,
      items: draft.items.map((item) => ({
        key: item.key,
        topicKey: item.topicKey,
        type: item.type,
        stage: item.stage ?? null,
        date: item.date,
        role: item.role,
      })),
    });
    expect(map.units).toHaveLength(input.exam!.topics.length);
    // Every unit is either covered or explicitly listed as orphaned — never silently
    // absent, which is the answer to "have all my topics been accounted for?".
    expect(map.units.filter((unit) => unit.state !== "UNSCHEDULED").length).toBe(
      units.length - map.unscheduled.length
    );
    expect(map.unscheduled.every((key) => units.some((unit) => unit.key === key))).toBe(
      true
    );
  });

  it("6. important material is revisited, and legitimately so", () => {
    const { input, draft } = exam();
    const items = draft.items.map((item) => ({
      key: item.key,
      topicRef:
        draft.topics.find((topic) => topic.key === item.topicKey)?.scopeRef ??
        item.topicKey,
      type: item.type,
      stage: item.stage ?? null,
      masteryStage: item.masteryStage ?? null,
      date: item.date,
      retrievalGroupId: item.retrievalGroupId ?? null,
      retrievalIndex: item.retrievalIndex ?? null,
      minimumGapDays: item.minimumGapDays ?? null,
      retrievalPurpose: item.retrievalPurpose ?? null,
    }));
    // Either the plan schedules stamped retrieval, or it has none to violate. There is
    // no third state in which the answer is unknown: the invariant checker runs over
    // exactly the stamped touches the plan carries.
    const stamped = items
      .filter((item) => item.retrievalPurpose !== null)
      .map((item) => ({
        ref: item.key,
        topicRef: item.topicRef,
        date: item.date,
        purpose: item.retrievalPurpose!,
        minimumGapDays: item.minimumGapDays ?? undefined,
        groupId: item.retrievalGroupId,
        index: item.retrievalIndex ?? undefined,
      }));
    const learningDateOf = (topicRef: string) => {
      const learn = items
        .filter(
          (item) =>
            item.topicRef === topicRef &&
            (item.type === "LEARN" ||
              item.masteryStage === "LEARN" ||
              item.masteryStage === "UNDERSTAND")
        )
        .map((item) => item.date)
        .sort();
      return learn.length ? learn[learn.length - 1] : null;
    };
    expect(
      retrievalViolations({
        startDate: input.startDate,
        endDate: input.endDate,
        retrievals: stamped,
        learningDateOf,
      })
    ).toEqual([]);
    const revisits = items.filter((item) =>
      ["RECALL", "REVIEW"].includes(item.type)
    );
    expect(revisits.length).toBeGreaterThan(0);
  });

  it("7. the workload carries the signals a realism judgement needs", () => {
    for (const { draft } of [exam(), mastery()]) {
      const advisories = intensityAdvisories(draft.items);
      // Intensity is derived, so the signal exists for every item and the advisory is
      // never fatal: it reports a rhythm, it does not refuse a plan.
      for (const advisory of advisories)
        expect(["LOW", "MEDIUM"]).toContain(advisory.severity);
      for (const item of draft.items) expect(item.minutes).toBeGreaterThanOrEqual(15);
    }
  });

  it("8. explicit priorities are visible in the plan, not only in the input", () => {
    const { input, draft } = exam();
    const high = input.exam!.topics.filter(
      (topic) => priorityLevel(topic) === "HIGH"
    );
    for (const topic of high) {
      const ref = `t${input.exam!.topics.indexOf(topic) + 1}`;
      const topicKey = draft.topics.find(
        (candidate) => candidate.scopeRef === ref
      )?.key;
      expect(topicKey).toBeDefined();
      if (!topicKey) continue;
      const items = draft.items.filter((item) => item.topicKey === topicKey);
      // A high-priority unit has real work in the plan; the floors are enforced by the
      // mode validators, and this asserts the plan carries the work those floors refer
      // to, so "did the planner use my priorities?" has an inspectable answer.
      expect(items.length).toBeGreaterThan(0);
    }
    if (!high.length) expect(draft.items.length).toBeGreaterThan(0);
  });

  it("9. each task says when it is done", () => {
    for (const { draft } of [exam(), mastery(), roadmap()]) {
      for (const item of draft.items) {
        // Where an item exists, its completion condition must be present and
        // observable. The generator's text is resolved through the default before it
        // is stored, so the plan always carries one.
        const criteria = item.completionCriteria ?? "";
        expect(criteria.trim().length).toBeGreaterThan(0);
        expect(completionCriteriaIssue(criteria, item)).toBeNull();
      }
    }
  });
});

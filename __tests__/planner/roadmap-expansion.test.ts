import { describe, expect, it, vi } from "vitest";
import {
  ExpansionProposalV1Schema,
  type ExpansionItem,
} from "@/lib/planner/expansion-fields";
import {
  expansionDays,
  expansionScope,
  periodDays,
  validateExpansionItems,
  validateRollingWeeklyLimit,
} from "@/lib/planner/expansion-policy";
import {
  EXPANSION_MAX_ITEMS,
  EXPANSION_PROVIDER_CALL_BUDGET,
  expansionRepairTargets,
  generateExpansion,
  validateExpansionStructure,
} from "@/lib/ai/planner/expansion";
import { normalizeExpansion, normalizeProposal } from "@/lib/planner/server/core";
import { UserInputV1Schema } from "@/lib/planner/contracts";
import {
  periodSpecsFor,
  roadmapInput,
  roadmapStructureForComparison,
  type RoadmapDraft,
} from "@/lib/planner/roadmap-policy";
import { completionCriteriaIssue } from "@/lib/planner/done";
import type { AvailabilitySnapshot } from "@/lib/planner/capacity";
import {
  roadmapAvailability,
  roadmapFixture,
  roadmapProposal,
} from "./roadmap-fixtures";

const jsonOf = (value: unknown) => ({ text: JSON.stringify(value) });

function preparedRoadmap(): { draft: RoadmapDraft; milestoneKey: string } {
  const draft = normalizeProposal(roadmapFixture(), roadmapProposal(roadmapFixture()));
  if (draft.mode !== "ROADMAP") throw new Error("roadmap draft expected");
  return { draft, milestoneKey: draft.milestones[0].key };
}

/** A valid expansion for the first milestone: one item per confirmed unit. */
function expansionItems(units: number, dates: string[]): ExpansionItem[] {
  return Array.from({ length: units }, (_, index) => ({
    ref: `i${index + 1}`,
    topicRef: `t${index + 1}`,
    relatedTopicRefs: [],
    type: "LEARN" as const,
    title: `Study session ${index + 1}`,
    description: "Work through the planned material for this unit.",
    rationale: "First pass over the unit before practice.",
    completionCriteria: "Complete the planned reading and note open questions.",
    date: dates[index % dates.length],
    minutes: 30,
    dependsOn: index === 0 ? [] : [`i${index}`],
  }));
}

describe("Expansion scope", () => {
  it("scopes strictly to one milestone's own units and period", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const milestone = draft.milestones[0];
    expect(scope.topics.map((topic) => topic.key)).toEqual(milestone.topicKeys);
    expect(scope.period.startDate).toBe("2030-01-07");
    expect(scope.period.endDate).toBe("2030-01-31");
    expect(scope.topics.length).toBeLessThan(draft.topics.length);
    // A neighbouring milestone is a different scope entirely.
    const other = expansionScope(draft, draft.milestones[1].key, input);
    expect(other.topics.map((topic) => topic.key)).not.toEqual(
      scope.topics.map((topic) => topic.key)
    );
  });

  it("rejects an unknown or removed milestone", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    expect(() =>
      expansionScope(draft, "00000000-0000-4000-8000-000000000000", input)
    ).toThrow("UNKNOWN_MILESTONE");
    const removed = {
      ...draft,
      milestones: draft.milestones.map((milestone) =>
        milestone.key === milestoneKey ? { ...milestone, removed: true } : milestone
      ),
    };
    expect(() => expansionScope(removed, milestoneKey, input)).toThrow(
      "MILESTONE_REMOVED"
    );
  });

  it("computes the period's own usable days and capacity", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const days = periodDays(input, roadmapAvailability(), scope);
    expect(days).toHaveLength(25);
    // Sundays are unavailable in the fixture.
    expect(days.filter((day) => day.remaining > 0).length).toBeLessThan(25);
    expect(expansionDays(input, roadmapAvailability(), scope).every((day) => day.remainingMinutes >= 15)).toBe(true);
  });
});

describe("Expansion deterministic rules", () => {
  it("accepts a bounded segment and rejects anything outside it", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const valid = expansionItems(scope.topics.length, ["2030-01-08", "2030-01-09"]);
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, valid)
    ).not.toThrow();
    expect(() => validateExpansionStructure(scope, valid)).not.toThrow();
    // A unit that belongs to another period is refused.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [
        { ...valid[0], topicRef: "t99" },
      ])
    ).toThrow("EXPANSION_SCOPE_VIOLATION");
    // A date outside the selected period is refused.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [
        { ...valid[0], date: "2030-03-04" },
      ])
    ).toThrow("OUTSIDE_MILESTONE_PERIOD");
    // More minutes in one day than the period's capacity allows is refused.
    expect(() =>
      validateExpansionItems(input, roadmapAvailability(), scope, [
        { ...valid[0], minutes: 240 },
        { ...valid[1] ?? valid[0], ref: "i9", minutes: 240, date: "2030-01-08" },
      ])
    ).toThrow("INSUFFICIENT_PERIOD_CAPACITY");
  });

  it("enforces HARD session and rolling weekly limits only where days are known", () => {
    const base = roadmapFixture();
    const limited = roadmapInput(
      UserInputV1Schema.parse({
        ...base,
        constraints: [
          {
            kind: "MAX_SESSION_MINUTES",
            strength: "HARD",
            value: 45,
            source: "USER_EXPLICIT",
          },
          {
            kind: "MAX_WEEKLY_MINUTES",
            strength: "HARD",
            value: 120,
            source: "USER_EXPLICIT",
          },
        ],
      })
    );
    const draft = normalizeProposal(limited, roadmapProposal(limited));
    if (draft.mode !== "ROADMAP") throw new Error("roadmap expected");
    const scope = expansionScope(draft, draft.milestones[0].key, limited);
    // One 60-minute session breaks the required session length.
    expect(() =>
      validateExpansionItems(limited, roadmapAvailability(), scope, [
        { ...expansionItems(1, ["2030-01-08"])[0], minutes: 60 },
      ])
    ).toThrow("HARD_SESSION_LIMIT_EXCEEDED");
    // Two 45-minute sessions in the same seven days break the weekly limit.
    expect(() =>
      validateExpansionItems(limited, roadmapAvailability(), scope, [
        { ...expansionItems(1, ["2030-01-08"])[0], minutes: 45 },
        { ...expansionItems(1, ["2030-01-10"])[0], ref: "i9", minutes: 45 },
        { ...expansionItems(1, ["2030-01-12"])[0], ref: "i10", minutes: 45 },
      ])
    ).toThrow("HARD_WEEKLY_LIMIT_EXCEEDED");
    // The rolling check is a property of concrete days, not of milestones.
    expect(() =>
      validateRollingWeeklyLimit(limited, [
        { date: "2030-01-08", minutes: 60 },
        { date: "2030-01-15", minutes: 60 },
      ])
    ).not.toThrow();
  });

  it("requires every unit in the milestone to be touched", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    if (scope.topics.length < 2) return;
    expect(() => validateExpansionStructure(scope, expansionItems(1, ["2030-01-08"]))).toThrow(
      "MISSING_EXPANSION_UNIT"
    );
  });
});

describe("Expansion assembly and generation", () => {
  it("copies the parent structure verbatim so neighbours cannot change", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const items = expansionItems(scope.topics.length, ["2030-01-08", "2030-01-09"]);
    const assembled = normalizeExpansion(input, draft, scope, items);
    expect(assembled.expansion).toEqual({ milestoneKey });
    expect(assembled.items).toHaveLength(items.length);
    expect(
      assembled.items.every((item) => item.milestoneKey === milestoneKey)
    ).toBe(true);
    // Only the items are new: the strategic structure is byte-identical.
    expect(JSON.stringify(roadmapStructureForComparison(assembled))).toBe(
      JSON.stringify(roadmapStructureForComparison(draft))
    );
    expect(assembled.periods).toEqual(draft.periods);
    expect(assembled.milestones).toEqual(draft.milestones);
  });

  it("gives every actionable item a bounded Definition of Done", async () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const proposal = {
      schemaVersion: 1 as const,
      items: expansionItems(scope.topics.length, ["2030-01-08", "2030-01-09"]).map(
        (item) => ({ ...item, completionCriteria: "Fully understand this unit" })
      ),
    };
    const result = await generateExpansion(
      input,
      draft,
      milestoneKey,
      roadmapAvailability(),
      [],
      new AbortController().signal,
      {
        adapter: () => ({
          generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)),
        }),
        validateItems: (items) =>
          validateExpansionItems(input, roadmapAvailability(), scope, items),
        acceptRepair: (items) => items,
      }
    );
    expect(result.items.length).toBe(scope.topics.length);
    for (const item of result.items) {
      expect(item.completionCriteria).toBeTruthy();
      expect(completionCriteriaIssue(item.completionCriteria!, item)).toBeNull();
      expect(item.completionCriteria).not.toMatch(/fully understand/i);
    }
    expect(result.calls).toBe(1);
    expect(result.calls).toBeLessThanOrEqual(EXPANSION_PROVIDER_CALL_BUDGET);
  });

  it("repairs only the flagged items and rejects a wider patch", async () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const proposal = {
      schemaVersion: 1 as const,
      items: expansionItems(scope.topics.length, ["2030-01-08", "2030-01-09"]),
    };
    const critic = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        issues: [
          {
            issueCode: "TASK_VAGUE",
            affectedItemRefs: ["i1"],
            severity: "MEDIUM",
            patchInstruction: "Say exactly what to produce in this session.",
          },
        ],
      })
    );
    const repaired = vi.fn().mockResolvedValue(
      jsonOf({
        schemaVersion: 1,
        items: [
          {
            ...proposal.items[0],
            description: "Complete exercises 1-6 and mark every step you had to look up.",
          },
        ],
      })
    );
    const result = await generateExpansion(
      input,
      draft,
      milestoneKey,
      roadmapAvailability(),
      [],
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)) }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({ generateResponse: repaired }),
        },
        validateItems: (items) =>
          validateExpansionItems(input, roadmapAvailability(), scope, items),
        acceptRepair: (items) => items,
      }
    );
    expect(result.review.critic).toBe("ISSUES_REPAIRED");
    expect(result.items[0].description).toContain("exercises 1-6");
    for (let index = 1; index < proposal.items.length; index += 1)
      expect(result.items[index]).toEqual(proposal.items[index]);

    const wider = await generateExpansion(
      input,
      draft,
      milestoneKey,
      roadmapAvailability(),
      [],
      new AbortController().signal,
      {
        adapter: () => ({ generateResponse: vi.fn().mockResolvedValue(jsonOf(proposal)) }),
        semantic: {
          criticAdapter: () => ({ generateResponse: critic }),
          repairAdapter: () => ({
            // A patch that also returns an item nobody flagged is out of scope.
            generateResponse: vi.fn().mockResolvedValue(
              jsonOf({
                schemaVersion: 1,
                items: [
                  { ...proposal.items[0], description: "Complete the first exercise set." },
                  { ...proposal.items[0], ref: "i9", title: "Unflagged extra item" },
                ],
              })
            ),
          }),
        },
        validateItems: (items) =>
          validateExpansionItems(input, roadmapAvailability(), scope, items),
        acceptRepair: (items) => items,
      }
    );
    expect(wider.review.critic).toBe("UNREPAIRED");
    expect(wider.items).toEqual(proposal.items);
    expect(expansionRepairTargets(proposal.items, [])).toEqual([]);
  });

  it("declares its own bounded budgets and item ceiling", () => {
    expect(EXPANSION_MAX_ITEMS).toBe(60);
    expect(EXPANSION_PROVIDER_CALL_BUDGET).toBeLessThanOrEqual(5);
    expect(ExpansionProposalV1Schema.safeParse({ schemaVersion: 1, items: [] }).success).toBe(
      false
    );
    // Expansion never accepts an Exam-only intent.
    expect(
      ExpansionProposalV1Schema.safeParse({
        schemaVersion: 1,
        items: [{ ...expansionItems(1, ["2030-01-08"])[0], type: "MOCK_EXAM" }],
      }).success
    ).toBe(false);
  });

  it("keeps an unchanged segment capacity check scoped to its period", () => {
    const input = roadmapFixture();
    const { draft, milestoneKey } = preparedRoadmap();
    const scope = expansionScope(draft, milestoneKey, input);
    const empty: AvailabilitySnapshot = { ...roadmapAvailability(), existingWork: [] };
    const days = periodDays(input, empty, scope);
    expect(days.reduce((total, day) => total + Math.max(0, day.remaining), 0)).toBeGreaterThan(0);
    expect(periodSpecsFor(input)).toHaveLength(6);
    void draft;
  });
});
